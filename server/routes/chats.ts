import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database/config';
import { AuthRequest, Chat, ChatWithParticipants, UserWithoutPassword, ApiResponse, PaginatedResponse } from '../types';

const router = Router();

// Get all chats for current user
router.get('/', async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;

    console.log('📋 GET CHATS - User ID:', userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // Get direct chats (private)
    const { rows: directChats } = await pool.query(`
      SELECT 
        dc.id,
        dc.created_at,
        dc.updated_at,
        'private' as type,
        NULL as name,
        (
          SELECT COUNT(*)
          FROM direct_messages dm
          WHERE dm.direct_chat_id = dc.id
        ) as message_count,
        (
          SELECT COUNT(*)
          FROM direct_messages dm
          WHERE dm.direct_chat_id = dc.id AND dm.read = false AND dm.sender_id != $1
        ) as unread_count,
        (
          SELECT dm.content
          FROM direct_messages dm
          WHERE dm.direct_chat_id = dc.id
          ORDER BY dm.created_at DESC
          LIMIT 1
        ) as last_message_content,
        (
          SELECT dm.created_at
          FROM direct_messages dm
          WHERE dm.direct_chat_id = dc.id
          ORDER BY dm.created_at DESC
          LIMIT 1
        ) as last_message_time
      FROM direct_chats dc
      WHERE dc.user1_id = $1 OR dc.user2_id = $1
      ORDER BY last_message_time DESC, dc.updated_at DESC
    `, [userId]);

    // Get group chats
    const { rows: groupChats } = await pool.query(`
      SELECT 
        gc.id,
        gc.name,
        gc.created_at,
        gc.updated_at,
        'group' as type,
        (
          SELECT COUNT(*)
          FROM group_messages gm
          WHERE gm.group_chat_id = gc.id
        ) as message_count,
        0 as unread_count,
        (
          SELECT gm.content
          FROM group_messages gm
          WHERE gm.group_chat_id = gc.id
          ORDER BY gm.created_at DESC
          LIMIT 1
        ) as last_message_content,
        (
          SELECT gm.created_at
          FROM group_messages gm
          WHERE gm.group_chat_id = gc.id
          ORDER BY gm.created_at DESC
          LIMIT 1
        ) as last_message_time
      FROM group_chats gc
      INNER JOIN group_chat_participants gcp ON gc.id = gcp.group_chat_id
      WHERE gcp.user_id = $1
      ORDER BY last_message_time DESC, gc.updated_at DESC
    `, [userId]);

    // Combine and sort all chats
    const allChats = [...directChats, ...groupChats].sort((a, b) => {
      const aTime = a.last_message_time || a.updated_at;
      const bTime = b.last_message_time || b.updated_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    console.log('📋 GET CHATS - Direct chats found:', directChats.length);
    console.log('📋 GET CHATS - Group chats found:', groupChats.length);
    console.log('📋 GET CHATS - Total chats:', allChats.length);

    // For private chats, get the other participant
    const chatsWithParticipants = await Promise.all(
      allChats.map(async (chat: any) => {
        if (chat.type === 'private') {
          // Get the other user in the direct chat
          const { rows: otherUser } = await pool.query(`
            SELECT u.id, u.name, u.email, u.avatar, u.status
            FROM users u
            INNER JOIN direct_chats dc ON (
              CASE 
                WHEN dc.user1_id = $1 THEN u.id = dc.user2_id
                ELSE u.id = dc.user1_id
              END
            )
            WHERE dc.id = $2
          `, [userId, chat.id]);

          const otherParticipant = otherUser[0] as UserWithoutPassword;
          return {
            ...chat,
            other_participant: otherParticipant,
            last_message: chat.last_message_content ? {
              content: chat.last_message_content,
              created_at: chat.last_message_time
            } : null
          };
        }

        return {
          ...chat,
          last_message: chat.last_message_content ? {
            content: chat.last_message_content,
            created_at: chat.last_message_time
          } : null
        };
      })
    );

    return res.json({
      success: true,
      data: chatsWithParticipants
    } as ApiResponse<any[]>);
  } catch (error) {
    console.error('Get chats error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get chats'
    } as ApiResponse);
  }
});

// Get chat by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    console.log('📋 GET CHAT BY ID - Chat ID:', id);
    console.log('📋 GET CHAT BY ID - User ID:', userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // First, try to find as direct chat
    const { rows: directChats } = await pool.query(
      'SELECT * FROM direct_chats WHERE id = $1',
      [id]
    );

    if (directChats.length > 0) {
      const directChat = directChats[0];

      // Check if user is participant
      if (directChat.user1_id !== userId && directChat.user2_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Get the other participant
      const otherUserId = directChat.user1_id === userId ? directChat.user2_id : directChat.user1_id;
      const { rows: otherUser } = await pool.query(
        'SELECT id, name, email, avatar, status FROM users WHERE id = $1',
        [otherUserId]
      );

      const chatWithParticipants = {
        id: directChat.id,
        type: 'private',
        created_at: directChat.created_at,
        updated_at: directChat.updated_at,
        participants: [
          {
            id: userId,
            role: 'member'
          },
          {
            id: otherUserId,
            role: 'member'
          }
        ],
        other_participant: otherUser[0]
      };

      return res.json({
        success: true,
        data: chatWithParticipants
      } as ApiResponse<any>);
    }

    // If not found as direct chat, try as group chat
    const { rows: groupChats } = await pool.query(
      'SELECT * FROM group_chats WHERE id = $1',
      [id]
    );

    if (groupChats.length > 0) {
      const groupChat = groupChats[0];

      // Check if user is participant
      const { rows: participants } = await pool.query(
        'SELECT * FROM group_chat_participants WHERE group_chat_id = $1 AND user_id = $2',
        [id, userId]
      );

      if (participants.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Get all participants
      const { rows: chatParticipants } = await pool.query(`
        SELECT u.id, u.name, u.email, u.avatar, u.status, gcp.role
        FROM users u
        INNER JOIN group_chat_participants gcp ON u.id = gcp.user_id
        WHERE gcp.group_chat_id = $1
      `, [id]);

      const chatWithParticipants = {
        id: groupChat.id,
        name: groupChat.name,
        type: 'group',
        created_at: groupChat.created_at,
        updated_at: groupChat.updated_at,
        participants: chatParticipants
      };

      return res.json({
        success: true,
        data: chatWithParticipants
      } as ApiResponse<any>);
    }

    // Chat not found
    return res.status(404).json({
      success: false,
      error: 'Chat not found'
    } as ApiResponse);
  } catch (error) {
    console.error('Get chat error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get chat'
    } as ApiResponse);
  }
});

// Create new chat
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { type, participants, name } = req.body;
    const userId = req.user?.id;

    console.log('🔨 CREATE CHAT - Type:', type);
    console.log('🔨 CREATE CHAT - Participants:', participants);
    console.log('🔨 CREATE CHAT - Name:', name);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    if (!type || !participants || !Array.isArray(participants)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data'
      } as ApiResponse);
    }

    // For private chats, ensure only 1 other participant
    if (type === 'private' && participants.length !== 1) {
      return res.status(400).json({
        success: false,
        error: 'Private chats must have exactly 1 other participant'
      } as ApiResponse);
    }

    // For group chats, ensure name is provided
    if (type === 'group' && !name) {
      return res.status(400).json({
        success: false,
        error: 'Group name is required'
      } as ApiResponse);
    }

    let chatId: string;
    let chatData: any;

    if (type === 'private') {
      const otherUserId = participants[0];

      // Check if direct chat already exists
      const { rows: existingDirectChats } = await pool.query(`
        SELECT id FROM direct_chats 
        WHERE (user1_id = $1 AND user2_id = $2) 
        OR (user1_id = $2 AND user2_id = $1)
      `, [userId, otherUserId]);

      if (existingDirectChats.length > 0) {
        // Return existing chat
        const existingChatId = existingDirectChats[0].id;
        const { rows: existingChat } = await pool.query(
          'SELECT * FROM direct_chats WHERE id = $1',
          [existingChatId]
        );

        return res.status(200).json({
          success: true,
          data: {
            id: existingChat[0].id,
            type: 'private',
            created_at: existingChat[0].created_at,
            updated_at: existingChat[0].updated_at
          }
        } as ApiResponse<any>);
      }

      // Create new direct chat
      chatId = uuidv4();
      await pool.query(
        'INSERT INTO direct_chats (id, user1_id, user2_id) VALUES ($1, $2, $3)',
        [chatId, userId, otherUserId]
      );

      // Get created direct chat
      const { rows: directChats } = await pool.query(
        'SELECT * FROM direct_chats WHERE id = $1',
        [chatId]
      );

      chatData = {
        id: directChats[0].id,
        type: 'private',
        created_at: directChats[0].created_at,
        updated_at: directChats[0].updated_at
      };

    } else if (type === 'group') {
      // Create new group chat
      chatId = uuidv4();
      await pool.query(
        'INSERT INTO group_chats (id, name, created_by) VALUES ($1, $2, $3)',
        [chatId, name, userId]
      );

      // Add participants to group
      const allParticipants = [userId, ...participants];
      for (const participantId of allParticipants) {
        const role = participantId === userId ? 'admin' : 'member';
        await pool.query(
          'INSERT INTO group_chat_participants (id, group_chat_id, user_id, role) VALUES ($1, $2, $3, $4)',
          [uuidv4(), chatId, participantId, role]
        );
      }

      // Get created group chat
      const { rows: groupChats } = await pool.query(
        'SELECT * FROM group_chats WHERE id = $1',
        [chatId]
      );

      chatData = {
        id: groupChats[0].id,
        name: groupChats[0].name,
        type: 'group',
        created_at: groupChats[0].created_at,
        updated_at: groupChats[0].updated_at
      };
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid chat type'
      } as ApiResponse);
    }

    console.log('🔨 CREATE CHAT - Created chat:', chatData);

    return res.status(201).json({
      success: true,
      data: chatData
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Create chat error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create chat'
    } as ApiResponse);
  }
});

// Update chat
router.put('/:id', async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user?.id;

    console.log('📝 UPDATE CHAT - Chat ID:', id);
    console.log('📝 UPDATE CHAT - New name:', name);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // First, try to find as direct chat
    const { rows: directChats } = await pool.query(
      'SELECT * FROM direct_chats WHERE id = $1',
      [id]
    );

    if (directChats.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot update direct chats'
      } as ApiResponse);
    }

    // If not found as direct chat, try as group chat
    const { rows: groupChats } = await pool.query(
      'SELECT * FROM group_chats WHERE id = $1',
      [id]
    );

    if (groupChats.length > 0) {
      // Check if user is admin
      const { rows: participants } = await pool.query(
        'SELECT role FROM group_chat_participants WHERE group_chat_id = $1 AND user_id = $2',
        [id, userId]
      );

      const participant = participants[0];

      if (!participant || participant.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Only admins can update chat'
        } as ApiResponse);
      }

      // Update group chat
      await pool.query(
        'UPDATE group_chats SET name = $1 WHERE id = $2',
        [name, id]
      );

      // Get updated chat
      const { rows: updatedChats } = await pool.query(
        'SELECT * FROM group_chats WHERE id = $1',
        [id]
      );

      const chat = updatedChats[0];

      return res.json({
        success: true,
        data: {
          id: chat.id,
          name: chat.name,
          type: 'group',
          created_at: chat.created_at,
          updated_at: chat.updated_at
        }
      } as ApiResponse<any>);
    }

    return res.status(404).json({
      success: false,
      error: 'Chat not found'
    } as ApiResponse);
  } catch (error) {
    console.error('Update chat error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update chat'
    } as ApiResponse);
  }
});

// Delete chat
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    console.log('🗑️ DELETE CHAT - Chat ID:', id);
    console.log('🗑️ DELETE CHAT - User ID:', userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // First, try to find as direct chat
    const { rows: directChats } = await pool.query(
      'SELECT * FROM direct_chats WHERE id = $1',
      [id]
    );

    if (directChats.length > 0) {
      const directChat = directChats[0];

      // Check if user is participant
      if (directChat.user1_id !== userId && directChat.user2_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Delete direct chat (cascade will handle related records)
      await pool.query('DELETE FROM direct_chats WHERE id = $1', [id]);

      return res.json({
        success: true,
        message: 'Direct chat deleted successfully'
      } as ApiResponse);
    }

    // If not found as direct chat, try as group chat
    const { rows: groupChats } = await pool.query(
      'SELECT * FROM group_chats WHERE id = $1',
      [id]
    );

    if (groupChats.length > 0) {
      // Check if user is admin
      const { rows: participants } = await pool.query(
        'SELECT role FROM group_chat_participants WHERE group_chat_id = $1 AND user_id = $2',
        [id, userId]
      );

      const participant = participants[0];

      if (!participant || participant.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Only admins can delete chat'
        } as ApiResponse);
      }

      // Delete group chat (cascade will handle related records)
      await pool.query('DELETE FROM group_chats WHERE id = $1', [id]);

      return res.json({
        success: true,
        message: 'Group chat deleted successfully'
      } as ApiResponse);
    }

    return res.status(404).json({
      success: false,
      error: 'Chat not found'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete chat error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete chat'
    } as ApiResponse);
  }
});

// Get messages for a chat
router.get('/:id/messages', async (req: AuthRequest, res: Response): Promise<Response> => {
  const { id: chatId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const userId = req.user?.id;

  try {
    console.log('📨 GET MESSAGES - Chat ID:', chatId);
    console.log('📨 GET MESSAGES - Page:', page);
    console.log('📨 GET MESSAGES - Limit:', limit);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // First, try to find as direct chat
    const { rows: directChats } = await pool.query(
      'SELECT * FROM direct_chats WHERE id = $1',
      [chatId]
    );

    if (directChats.length > 0) {
      const directChat = directChats[0];

      // Check if user is participant
      if (directChat.user1_id !== userId && directChat.user2_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      // Get total count for direct messages
      const { rows: countResult } = await pool.query(
        'SELECT COUNT(*) as total FROM direct_messages WHERE direct_chat_id = $1',
        [chatId]
      );

      const total = parseInt(countResult[0].total);

      // Get direct messages with sender info
      const { rows: messages } = await pool.query(`
        SELECT 
          dm.id,
          dm.content,
          dm.sender_id,
          dm.direct_chat_id as chat_id,
          dm.read,
          dm.delivered,
          dm.created_at,
          dm.updated_at,
          u.id as sender_id,
          u.name as sender_name,
          u.email as sender_email,
          u.avatar as sender_avatar,
          u.status as sender_status
        FROM direct_messages dm
        INNER JOIN users u ON dm.sender_id = u.id
        WHERE dm.direct_chat_id = $1
        ORDER BY dm.created_at DESC
        LIMIT $2 OFFSET $3
      `, [chatId, parseInt(limit as string), offset]);

      // Format messages
      const formattedMessages = messages.map(msg => ({
        id: msg.id,
        content: msg.content,
        sender_id: msg.sender_id,
        chat_id: msg.chat_id,
        read: Boolean(msg.read),
        delivered: Boolean(msg.delivered),
        created_at: msg.created_at,
        updated_at: msg.updated_at,
        sender: {
          id: msg.sender_id,
          name: msg.sender_name,
          email: msg.sender_email,
          avatar: msg.sender_avatar,
          status: msg.sender_status,
          created_at: msg.created_at,
          updated_at: msg.updated_at
        }
      }));

      const pagination = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        hasNext: offset + parseInt(limit as string) < total,
        hasPrev: parseInt(page as string) > 1
      };

      return res.json({
        success: true,
        data: {
          data: formattedMessages,
          pagination
        }
      } as ApiResponse<any>);
    }

    // If not found as direct chat, try as group chat
    const { rows: groupChats } = await pool.query(
      'SELECT * FROM group_chats WHERE id = $1',
      [chatId]
    );

    if (groupChats.length > 0) {
      // Check if user is participant
      const { rows: participants } = await pool.query(
        'SELECT * FROM group_chat_participants WHERE group_chat_id = $1 AND user_id = $2',
        [chatId, userId]
      );

      if (participants.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      // Get total count for group messages
      const { rows: countResult } = await pool.query(
        'SELECT COUNT(*) as total FROM group_messages WHERE group_chat_id = $1',
        [chatId]
      );

      const total = parseInt(countResult[0].total);

      // Get group messages with sender info
      const { rows: messages } = await pool.query(`
        SELECT 
          gm.id,
          gm.content,
          gm.sender_id,
          gm.group_chat_id as chat_id,
          gm.read_by,
          gm.delivered_to,
          gm.created_at,
          gm.updated_at,
          u.id as sender_id,
          u.name as sender_name,
          u.email as sender_email,
          u.avatar as sender_avatar,
          u.status as sender_status
        FROM group_messages gm
        INNER JOIN users u ON gm.sender_id = u.id
        WHERE gm.group_chat_id = $1
        ORDER BY gm.created_at DESC
        LIMIT $2 OFFSET $3
      `, [chatId, parseInt(limit as string), offset]);

      // Format messages
      const formattedMessages = messages.map(msg => ({
        id: msg.id,
        content: msg.content,
        sender_id: msg.sender_id,
        chat_id: msg.chat_id,
        read: msg.read_by ? msg.read_by.includes(userId) : false,
        read_by_recipient: msg.delivered_to ? msg.delivered_to.includes(userId) : false,
        delivered: msg.delivered_to || [],
        created_at: msg.created_at,
        updated_at: msg.updated_at,
        sender: {
          id: msg.sender_id,
          name: msg.sender_name,
          email: msg.sender_email,
          avatar: msg.sender_avatar,
          status: msg.sender_status,
          created_at: msg.created_at,
          updated_at: msg.updated_at
        }
      }));

      const pagination = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        hasNext: offset + parseInt(limit as string) < total,
        hasPrev: parseInt(page as string) > 1
      };

      return res.json({
        success: true,
        data: {
          data: formattedMessages,
          pagination
        }
      } as ApiResponse<any>);
    }

    return res.status(404).json({
      success: false,
      error: 'Chat not found'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get messages error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to get messages'
    } as ApiResponse);
  }
});

// Send message to a chat
router.post('/:id/messages', async (req: AuthRequest, res: Response) => {
  const { id: chatId } = req.params;
  const { content } = req.body;
  const userId = req.user?.id;

  try {
    console.log('📤 SEND MESSAGE - Chat ID:', chatId);
    console.log('📤 SEND MESSAGE - Content:', content?.substring(0, 50) + '...');

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      } as ApiResponse);
    }

    // First, try to find as direct chat
    const { rows: directChats } = await pool.query(
      'SELECT * FROM direct_chats WHERE id = $1',
      [chatId]
    );

    if (directChats.length > 0) {
      const directChat = directChats[0];

      // Check if user is participant
      if (directChat.user1_id !== userId && directChat.user2_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Create direct message
      const messageId = uuidv4();
      await pool.query(
        'INSERT INTO direct_messages (id, content, sender_id, direct_chat_id, delivered) VALUES ($1, $2, $3, $4, $5)',
        [messageId, content.trim(), userId, chatId, false]
      );

      // Update direct chat's updated_at timestamp
      await pool.query(
        'UPDATE direct_chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [chatId]
      );

      // Get created message with sender info
      const { rows: messages } = await pool.query(`
        SELECT 
          dm.id,
          dm.content,
          dm.sender_id,
          dm.direct_chat_id as chat_id,
          dm.read,
          dm.delivered,
          dm.created_at,
          dm.updated_at,
          u.id as sender_id,
          u.name as sender_name,
          u.email as sender_email,
          u.avatar as sender_avatar,
          u.status as sender_status
        FROM direct_messages dm
        INNER JOIN users u ON dm.sender_id = u.id
        WHERE dm.id = $1
      `, [messageId]);

      const message = messages[0];

      const formattedMessage = {
        id: message.id,
        content: message.content,
        sender_id: message.sender_id,
        chat_id: message.chat_id,
        read: Boolean(message.read),
        delivered: message.delivered ?? false,
        created_at: message.created_at,
        updated_at: message.updated_at,
        sender: {
          id: message.sender_id,
          name: message.sender_name,
          email: message.sender_email,
          avatar: message.sender_avatar,
          status: message.sender_status,
          created_at: message.created_at,
          updated_at: message.updated_at
        }
      };

      return res.status(201).json({
        success: true,
        data: formattedMessage
      } as ApiResponse<any>);
    }

    // If not found as direct chat, try as group chat
    const { rows: groupChats } = await pool.query(
      'SELECT * FROM group_chats WHERE id = $1',
      [chatId]
    );

    if (groupChats.length > 0) {
      // Check if user is participant
      const { rows: participants } = await pool.query(
        'SELECT * FROM group_chat_participants WHERE group_chat_id = $1 AND user_id = $2',
        [chatId, userId]
      );

      if (participants.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Create group message
      const messageId = uuidv4();
      await pool.query(
        'INSERT INTO group_messages (id, content, sender_id, group_chat_id) VALUES ($1, $2, $3, $4)',
        [messageId, content.trim(), userId, chatId]
      );

      // Update group chat's updated_at timestamp
      await pool.query(
        'UPDATE group_chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [chatId]
      );

      // Get created message with sender info
      const { rows: messages } = await pool.query(`
        SELECT 
          gm.id,
          gm.content,
          gm.sender_id,
          gm.group_chat_id as chat_id,
          gm.read_by,
          gm.delivered_to,
          gm.created_at,
          gm.updated_at,
          u.id as sender_id,
          u.name as sender_name,
          u.email as sender_email,
          u.avatar as sender_avatar,
          u.status as sender_status
        FROM group_messages gm
        INNER JOIN users u ON gm.sender_id = u.id
        WHERE gm.id = $1
      `, [messageId]);

      const message = messages[0];

      const formattedMessage = {
        id: message.id,
        content: message.content,
        sender_id: message.sender_id,
        chat_id: message.chat_id,
        read: message.read_by ? message.read_by.includes(userId) : false,
        read_by_recipient: message.delivered_to ? message.delivered_to.includes(userId) : false,
        delivered: message.delivered_to || [],
        created_at: message.created_at,
        updated_at: message.updated_at,
        sender: {
          id: message.sender_id,
          name: message.sender_name,
          email: message.sender_email,
          avatar: message.sender_avatar,
          status: message.sender_status,
          created_at: message.created_at,
          updated_at: message.updated_at
        }
      };

      return res.status(201).json({
        success: true,
        data: formattedMessage
      } as ApiResponse<any>);
    }

    return res.status(404).json({
      success: false,
      error: 'Chat not found'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Send message error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send message'
    } as ApiResponse);
  }
});

// Mark messages as read for a chat
router.put('/:id/messages/read', async (req: AuthRequest, res: Response) => {
  try {
    const { id: chatId } = req.params;
    const userId = req.user?.id;

    console.log('👁️ MARK READ - Chat ID:', chatId);
    console.log('👁️ MARK READ - User ID:', userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // First, try to find as direct chat
    const { rows: directChats } = await pool.query(
      'SELECT * FROM direct_chats WHERE id = $1',
      [chatId]
    );

    if (directChats.length > 0) {
      const directChat = directChats[0];

      // Check if user is participant
      if (directChat.user1_id !== userId && directChat.user2_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Get all messages that will be marked as read
      const { rows: messagesToMark } = await pool.query(
        'SELECT id FROM direct_messages WHERE direct_chat_id = $1 AND sender_id != $2 AND read = false',
        [chatId, userId]
      );

      // Mark all unread direct messages as read
      await pool.query(
        'UPDATE direct_messages SET read = true WHERE direct_chat_id = $1 AND sender_id != $2 AND read = false',
        [chatId, userId]
      );

      // Emit socket events for each message that was marked as read
      try {
        const { safeEmit } = require('../socket/socketManager');

        if (messagesToMark.length > 0) {
          console.log('📖 EMITTING READ EVENTS - Chat ID:', chatId, 'Messages:', messagesToMark.length);
          console.log('📖 Messages to mark:', messagesToMark.map(msg => msg.id));

          for (const message of messagesToMark) {
            console.log('📖 Emitting read event for message:', message.id);
            safeEmit('message:read', {
              chatId: chatId,
              messageId: message.id,
              userId: userId
            }, chatId);
          }
          console.log('📖 SUCCESSFULLY EMITTED READ EVENTS - Chat ID:', chatId);
        } else {
          console.log('📖 NO MESSAGES TO MARK - Chat ID:', chatId, 'Messages:', messagesToMark.length);
        }
      } catch (socketError) {
        console.error('Error emitting socket events:', socketError);
      }

      return res.json({
        success: true,
        message: 'Direct messages marked as read'
      } as ApiResponse);
    }

    // If not found as direct chat, try as group chat
    const { rows: groupChats } = await pool.query(
      'SELECT * FROM group_chats WHERE id = $1',
      [chatId]
    );

    if (groupChats.length > 0) {
      // Check if user is participant
      const { rows: participants } = await pool.query(
        'SELECT * FROM group_chat_participants WHERE group_chat_id = $1 AND user_id = $2',
        [chatId, userId]
      );

      if (participants.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Get all messages that will be marked as read
      const { rows: messagesToMark } = await pool.query(
        'SELECT id FROM group_messages WHERE group_chat_id = $1 AND sender_id != $2 AND (read_by IS NULL OR NOT (read_by ? $3))',
        [chatId, userId, userId]
      );

      // Mark all unread group messages as read by adding user to read_by array
      await pool.query(`
        UPDATE group_messages 
        SET read_by = CASE 
          WHEN read_by IS NULL THEN ARRAY[$2]
          ELSE array_append(read_by, $2)
        END
        WHERE group_chat_id = $1 
        AND sender_id != $2 
        AND (read_by IS NULL OR NOT (read_by ? $2))
      `, [chatId, userId]);

      // Emit socket events for each message that was marked as read
      try {
        const { safeEmit } = require('../socket/socketManager');

        if (messagesToMark.length > 0) {
          console.log('📖 EMITTING READ EVENTS - Chat ID:', chatId, 'Messages:', messagesToMark.length);
          console.log('📖 Messages to mark:', messagesToMark.map(msg => msg.id));

          for (const message of messagesToMark) {
            console.log('📖 Emitting read event for message:', message.id);
            safeEmit('message:read', {
              chatId: chatId,
              messageId: message.id,
              userId: userId
            }, chatId);
          }
          console.log('📖 SUCCESSFULLY EMITTED READ EVENTS - Chat ID:', chatId);
        } else {
          console.log('📖 NO MESSAGES TO MARK - Chat ID:', chatId, 'Messages:', messagesToMark.length);
        }
      } catch (socketError) {
        console.error('Error emitting socket events:', socketError);
      }

      return res.json({
        success: true,
        message: 'Group messages marked as read'
      } as ApiResponse);
    }

    return res.status(404).json({
      success: false,
      error: 'Chat not found'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Mark messages as read error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mark messages as read'
    } as ApiResponse);
  }
});

export default router; 
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database/config';
import { AuthRequest, Chat, ChatWithParticipants, UserWithoutPassword, ApiResponse, PaginatedResponse } from '../types';

const router = Router();

// Get all chats for current user
router.get('/', async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    const { rows: chats } = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.type,
        c.created_at,
        c.updated_at,
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.chat_id = c.id
        ) as message_count,
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.chat_id = c.id AND m.is_read = false AND m.sender_id != $1
        ) as unread_count,
        (
          SELECT m.content
          FROM messages m
          WHERE m.chat_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message_content,
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.chat_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message_time
      FROM chats c
      INNER JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = $2
      ORDER BY last_message_time DESC, c.updated_at DESC
    `, [userId, userId]);

    // For private chats, get the other participant
    const chatsWithParticipants = await Promise.all(
      chats.map(async (chat: any) => {
        if (chat.type === 'private') {
          const { rows: participants } = await pool.query(`
            SELECT u.id, u.name, u.email, u.avatar, u.status
            FROM users u
            INNER JOIN chat_participants cp ON u.id = cp.user_id
            WHERE cp.chat_id = $1 AND u.id != $2
          `, [chat.id, userId]);

          const otherParticipant = participants[0] as UserWithoutPassword;
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

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // Check if user is participant
    const { rows: participants } = await pool.query(
      'SELECT * FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (participants.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    // Get chat details
    const { rows: chats } = await pool.query(
      'SELECT * FROM chats WHERE id = $1',
      [id]
    );

    const chat = chats[0] as Chat;

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found'
      } as ApiResponse);
    }

    // Get participants
    const { rows: chatParticipants } = await pool.query(`
      SELECT u.id, u.name, u.email, u.avatar, u.status, cp.role
      FROM users u
      INNER JOIN chat_participants cp ON u.id = cp.user_id
      WHERE cp.chat_id = $1
    `, [id]);

    const chatWithParticipants: ChatWithParticipants = {
      ...chat,
      participants: chatParticipants as any[]
    };

    // For private chats, get the other participant
    if (chat.type === 'private') {
      const otherParticipant = chatParticipants.find(p => p.id !== userId);
      (chatWithParticipants as any).other_participant = otherParticipant;
    }

    return res.json({
      success: true,
      data: chatWithParticipants
    } as ApiResponse<ChatWithParticipants>);
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

    // For private chats, ensure only 2 participants
    if (type === 'private' && participants.length !== 1) {
      return res.status(400).json({
        success: false,
        error: 'Private chats must have exactly 2 participants'
      } as ApiResponse);
    }

    // For group chats, ensure name is provided
    if (type === 'group' && !name) {
      return res.status(400).json({
        success: false,
        error: 'Group name is required'
      } as ApiResponse);
    }

    // Check if private chat already exists
    if (type === 'private') {
      const otherUserId = participants[0];
      const { rows: existingChats } = await pool.query(`
        SELECT c.id
        FROM chats c
        INNER JOIN chat_participants cp1 ON c.id = cp1.chat_id
        INNER JOIN chat_participants cp2 ON c.id = cp2.chat_id
        WHERE c.type = 'private'
        AND cp1.user_id = $1
        AND cp2.user_id = $2
      `, [userId, otherUserId]);

      if (existingChats.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Private chat already exists'
        } as ApiResponse);
      }
    }

    // Create chat
    const chatId = uuidv4();
    await pool.query(
      'INSERT INTO chats (id, name, type) VALUES ($1, $2, $3)',
      [chatId, name || null, type]
    );

    // Add participants
    const allParticipants = [userId, ...participants];
    for (const participantId of allParticipants) {
      await pool.query(
        'INSERT INTO chat_participants (id, chat_id, user_id, role) VALUES ($1, $2, $3, $4)',
        [uuidv4(), chatId, participantId, participantId === userId ? 'admin' : 'member']
      );
    }

    // Get created chat
    const { rows: chats } = await pool.query(
      'SELECT * FROM chats WHERE id = $1',
      [chatId]
    );

    const chat = chats[0] as Chat;

    return res.status(201).json({
      success: true,
      data: chat
    } as ApiResponse<Chat>);
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

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // Check if user is admin
    const { rows: participants } = await pool.query(
      'SELECT role FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [id, userId]
    );

    const participant = participants[0];

    if (!participant || participant.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can update chat'
      } as ApiResponse);
    }

    // Update chat
    await pool.query(
      'UPDATE chats SET name = $1 WHERE id = $2',
      [name, id]
    );

    // Get updated chat
    const { rows: chats } = await pool.query(
      'SELECT * FROM chats WHERE id = $1',
      [id]
    );

    const chat = chats[0] as Chat;

    return res.json({
      success: true,
      data: chat
    } as ApiResponse<Chat>);
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

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // Check if user is admin
    const { rows: participants } = await pool.query(
      'SELECT role FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [id, userId]
    );

    const participant = participants[0];

    if (!participant || participant.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can delete chat'
      } as ApiResponse);
    }

    // Delete chat (cascade will handle related records)
    await pool.query('DELETE FROM chats WHERE id = $1', [id]);

    return res.json({
      success: true,
      message: 'Chat deleted successfully'
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

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // Check if user is participant
    const { rows: participants } = await pool.query(
      'SELECT * FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );

    if (participants.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get total count
    const { rows: countResult } = await pool.query(
      'SELECT COUNT(*) as total FROM messages WHERE chat_id = $1',
      [chatId]
    );

    const total = parseInt(countResult[0].total);

    // Get messages with sender info
    const { rows: messages } = await pool.query(`
      SELECT 
        m.id,
        m.content,
        m.sender_id,
        m.chat_id,
        m.is_read,
        m.is_read_by_recipient,
        m.deliveredTo,
        m.created_at,
        m.updated_at,
        u.id as sender_id,
        u.name as sender_name,
        u.email as sender_email,
        u.avatar as sender_avatar,
        u.status as sender_status
      FROM messages m
      INNER JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = $1
      ORDER BY m.created_at ASC
      LIMIT $2 OFFSET $3
    `, [chatId, parseInt(limit as string), offset]);

    // Format messages
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      content: msg.content,
      sender_id: msg.sender_id,
      chat_id: msg.chat_id,
      is_read: Boolean(msg.is_read),
      is_read_by_recipient: Boolean(msg.is_read_by_recipient),
      deliveredTo: msg.deliveredTo ? msg.deliveredTo : [],
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

    // Check if user is participant
    const { rows: participants } = await pool.query(
      'SELECT * FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );

    if (participants.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    // Create message
    const messageId = uuidv4();
    await pool.query(
      'INSERT INTO messages (id, content, sender_id, chat_id) VALUES ($1, $2, $3, $4)',
      [messageId, content.trim(), userId, chatId]
    );

    // Update chat's updated_at timestamp
    await pool.query(
      'UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [chatId]
    );

    // Get created message with sender info
    const { rows: messages } = await pool.query(`
      SELECT 
        m.id,
        m.content,
        m.sender_id,
        m.chat_id,
        m.is_read,
        m.is_read_by_recipient,
        m.deliveredTo,
        m.created_at,
        m.updated_at,
        u.id as sender_id,
        u.name as sender_name,
        u.email as sender_email,
        u.avatar as sender_avatar,
        u.status as sender_status
      FROM messages m
      INNER JOIN users u ON m.sender_id = u.id
      WHERE m.id = $1
    `, [messageId]);

    const message = messages[0];

    const formattedMessage = {
      id: message.id,
      content: message.content,
      sender_id: message.sender_id,
      chat_id: message.chat_id,
      is_read: Boolean(message.is_read),
      is_read_by_recipient: Boolean(message.is_read_by_recipient),
      deliveredTo: message.deliveredTo ? message.deliveredTo : [],
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

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // Check if user is participant
    const { rows: participants } = await pool.query(
      'SELECT * FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );

    if (participants.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    // Mark all unread messages as read
    await pool.query(
      'UPDATE messages SET is_read = true WHERE chat_id = $1 AND sender_id != $2 AND is_read = false',
      [chatId, userId]
    );

    return res.json({
      success: true,
      message: 'Messages marked as read'
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
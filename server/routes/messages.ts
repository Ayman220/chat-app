import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database/config';
import { AuthRequest, Message, MessageWithSender, ApiResponse, PaginatedResponse } from '../types';

const router = Router();

// Get messages for a chat
router.get('/:chatId', async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 20 } = req.query;
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
      ORDER BY m.created_at DESC
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
    } as ApiResponse<PaginatedResponse<MessageWithSender>>);
  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get messages'
    } as ApiResponse);
  }
});

// Send message
router.post('/:chatId', async (req: AuthRequest, res: Response) => {
  try {
    const { chatId } = req.params;
    const { content } = req.body;
    const userId = req.user?.id;

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

    const formattedMessage: MessageWithSender = {
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
    } as ApiResponse<MessageWithSender>);
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send message'
    } as ApiResponse);
  }
});

// Mark messages as read
router.put('/:chatId/read', async (req: AuthRequest, res: Response) => {
  try {
    const { chatId } = req.params;
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
  } catch (error) {
    console.error('Mark messages as read error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mark messages as read'
    } as ApiResponse);
  }
});

// Delete message
router.delete('/:chatId/:messageId', async (req: AuthRequest, res: Response) => {
  try {
    const { chatId, messageId } = req.params;
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

    // Check if user is the sender
    const { rows: messages } = await pool.query(
      'SELECT sender_id FROM messages WHERE id = $1 AND chat_id = $2',
      [messageId, chatId]
    );

    const message = messages[0];

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      } as ApiResponse);
    }

    if (message.sender_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own messages'
      } as ApiResponse);
    }

    // Delete message
    await pool.query(
      'DELETE FROM messages WHERE id = $1',
      [messageId]
    );

    return res.json({
      success: true,
      message: 'Message deleted successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete message error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete message'
    } as ApiResponse);
  }
});

export default router; 
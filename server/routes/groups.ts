import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database/config';
import { AuthRequest, UserWithoutPassword, ApiResponse } from '../types';

const router = Router();

// Get group participants
router.get('/:chatId/participants', async (req: AuthRequest, res: Response): Promise<Response> => {
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

    // Get all participants
    const { rows: groupParticipants } = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.avatar,
        u.status,
        u.created_at,
        u.updated_at,
        cp.role,
        cp.joined_at
      FROM users u
      INNER JOIN chat_participants cp ON u.id = cp.user_id
      WHERE cp.chat_id = $1
      ORDER BY cp.joined_at ASC
    `, [chatId]);

    return res.json({
      success: true,
      data: groupParticipants
    } as ApiResponse<any[]>);
  } catch (error) {
    console.error('Get group participants error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get group participants'
    } as ApiResponse);
  }
});

// Add participant to group
router.post('/:chatId/participants', async (req: AuthRequest, res: Response) => {
  try {
    const { chatId } = req.params;
    const { userId: newUserId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    if (!newUserId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      } as ApiResponse);
    }

    // Check if user is admin
    const { rows: participants } = await pool.query(
      'SELECT role FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );

    const participant = participants[0];

    if (!participant || participant.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can add participants'
      } as ApiResponse);
    }

    // Check if chat is a group
    const { rows: chats } = await pool.query(
      'SELECT type FROM chats WHERE id = $1',
      [chatId]
    );

    const chat = chats[0];

    if (!chat || chat.type !== 'group') {
      return res.status(400).json({
        success: false,
        error: 'Can only add participants to group chats'
      } as ApiResponse);
    }

    // Check if user already exists
    const { rows: existingParticipants } = await pool.query(
      'SELECT * FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, newUserId]
    );

    if (existingParticipants.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'User is already a participant'
      } as ApiResponse);
    }

    // Add participant
    await pool.query(
      'INSERT INTO chat_participants (id, chat_id, user_id, role) VALUES ($1, $2, $3, $4)',
      [uuidv4(), chatId, newUserId, 'member']
    );

    // Get added user info
    const { rows: users } = await pool.query(
      'SELECT id, name, email, avatar, status, created_at, updated_at FROM users WHERE id = $1',
      [newUserId]
    );

    const user = users[0] as UserWithoutPassword;

    return res.status(201).json({
      success: true,
      data: user
    } as ApiResponse<UserWithoutPassword>);
  } catch (error) {
    console.error('Add participant error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add participant'
    } as ApiResponse);
  }
});

// Remove participant from group
router.delete('/:chatId/participants/:participantId', async (req: AuthRequest, res: Response) => {
  try {
    const { chatId, participantId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // Check if user is admin or removing themselves
    const { rows: participants } = await pool.query(
      'SELECT role FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );

    const participant = participants[0];

    if (!participant) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    // Only admins can remove others, users can remove themselves
    if (participantId !== userId && participant.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can remove other participants'
      } as ApiResponse);
    }

    // Check if chat is a group
    const { rows: chats } = await pool.query(
      'SELECT type FROM chats WHERE id = $1',
      [chatId]
    );

    const chat = chats[0];

    if (!chat || chat.type !== 'group') {
      return res.status(400).json({
        success: false,
        error: 'Can only remove participants from group chats'
      } as ApiResponse);
    }

    // Remove participant
    await pool.query(
      'DELETE FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, participantId]
    );

    return res.json({
      success: true,
      message: 'Participant removed successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Remove participant error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to remove participant'
    } as ApiResponse);
  }
});

// Update participant role
router.put('/:chatId/participants/:participantId/role', async (req: AuthRequest, res: Response) => {
  try {
    const { chatId, participantId } = req.params;
    const { role } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role'
      } as ApiResponse);
    }

    // Check if user is admin
    const { rows: participants } = await pool.query(
      'SELECT role FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );

    const participant = participants[0];

    if (!participant || participant.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can update roles'
      } as ApiResponse);
    }

    // Check if chat is a group
    const { rows: chats } = await pool.query(
      'SELECT type FROM chats WHERE id = $1',
      [chatId]
    );

    const chat = chats[0];

    if (!chat || chat.type !== 'group') {
      return res.status(400).json({
        success: false,
        error: 'Can only update roles in group chats'
      } as ApiResponse);
    }

    // Update role
    await pool.query(
      'UPDATE chat_participants SET role = $1 WHERE chat_id = $2 AND user_id = $3',
      [role, chatId, participantId]
    );

    return res.json({
      success: true,
      message: 'Role updated successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Update role error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update role'
    } as ApiResponse);
  }
});

export default router; 
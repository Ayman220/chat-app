import { Router, Response } from 'express';
import pool from '../database/config';
import { AuthRequest, UserWithoutPassword, ApiResponse } from '../types';

const router = Router();

// Get all users with optional search
router.get('/', async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { search } = req.query;
    const userId = req.user?.id;

    console.log('🔍 USERS ENDPOINT - Search query:', search);
    console.log('🔍 USERS ENDPOINT - User ID:', userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    let query: string;
    let params: any[];

    if (search && typeof search === 'string' && search.trim().length > 0) {
      // Search users by name or email
      query = `
        SELECT id, name, email, avatar, status, created_at, updated_at 
        FROM users 
        WHERE id != $1 AND (name ILIKE $2 OR email ILIKE $3)
        ORDER BY name ASC
        LIMIT 20
      `;
      params = [userId, `%${search.trim()}%`, `%${search.trim()}%`];
      console.log('🔍 USERS ENDPOINT - Executing search query with params:', params);
    } else {
      // Get all users (for backward compatibility)
      query = `
        SELECT id, name, email, avatar, status, created_at, updated_at 
        FROM users 
        WHERE id != $1
        ORDER BY name ASC
        LIMIT 50
      `;
      params = [userId];
      console.log('🔍 USERS ENDPOINT - Executing all users query');
    }

    const { rows: users } = await pool.query(query, params);

    console.log('🔍 USERS ENDPOINT - Found users:', users.length);

    return res.json({
      success: true,
      data: users
    } as ApiResponse<UserWithoutPassword[]>);
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get users'
    } as ApiResponse);
  }
});

// Get user by ID
router.get('/:id', async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;

    const { rows: users } = await pool.query(
      'SELECT id, name, email, avatar, status, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );

    const user = users[0] as UserWithoutPassword;

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      } as ApiResponse);
    }

    return res.json({
      success: true,
      data: user
    } as ApiResponse<UserWithoutPassword>);
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user'
    } as ApiResponse);
  }
});

// Update user profile
router.put('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const { name, avatar, status } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (name) {
      updateFields.push('name = $' + (updateValues.length + 1));
      updateValues.push(name);
    }

    if (avatar) {
      updateFields.push('avatar = $' + (updateValues.length + 1));
      updateValues.push(avatar);
    }

    if (status) {
      updateFields.push('status = $' + (updateValues.length + 1));
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      } as ApiResponse);
    }

    updateValues.push(userId);

    await pool.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${updateValues.length}`,
      updateValues
    );

    // Get updated user
    const { rows: users } = await pool.query(
      'SELECT id, name, email, avatar, status, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    const updatedUser = users[0] as UserWithoutPassword;

    return res.json({
      success: true,
      data: updatedUser
    } as ApiResponse<UserWithoutPassword>);
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    } as ApiResponse);
  }
});



export default router; 
import { Router, Response } from 'express';
import { AuthRequest, UserWithoutPassword, ApiResponse } from '../types';
import { PrismaClient } from '../generated/prisma';

const router = Router();
const prisma = new PrismaClient();

// Get all users with optional search
router.get('/', async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { search } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    let users: any[];

    if (search && typeof search === 'string' && search.trim().length > 0) {
      // Search users by name or email
      users = await prisma.user.findMany({
        where: {
          id: { not: userId },
          OR: [
            { name: { contains: search.trim(), mode: 'insensitive' } },
            { email: { contains: search.trim(), mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          status: true,
          created_at: true,
          updated_at: true
        },
        orderBy: { name: 'asc' },
        take: 20
      });
    } else {
      // Get all users (for backward compatibility)
      users = await prisma.user.findMany({
        where: {
          id: { not: userId }
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          status: true,
          created_at: true,
          updated_at: true
        },
        orderBy: { name: 'asc' },
        take: 50
      });
    }

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

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        status: true,
        created_at: true,
        updated_at: true
      }
    });

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

    // Build update data object
    const updateData: any = {};

    if (name) {
      updateData.name = name;
    }

    if (avatar) {
      updateData.avatar = avatar;
    }

    if (status) {
      updateData.status = status;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      } as ApiResponse);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        status: true,
        created_at: true,
        updated_at: true
      }
    });

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

// Get last seen data for specific users
router.post('/last-seen', async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { userIds } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({
        success: false,
        error: 'userIds array is required'
      } as ApiResponse);
    }

    // Get last seen data for the requested users
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds }
      },
      select: {
        id: true,
        last_seen: true
      }
    });

    // Convert to object format for easy lookup
    const lastSeenData = users.reduce((acc: any, user: any) => {
      acc[user.id] = user.last_seen;
      return acc;
    }, {});

    return res.json({
      success: true,
      data: lastSeenData
    } as ApiResponse);
  } catch (error: any) {
    console.error('Error fetching last seen data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch last seen data'
    } as ApiResponse);
  }
});

export default router; 
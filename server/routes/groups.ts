import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, UserWithoutPassword, ApiResponse } from '../types';
import { PrismaClient } from '../generated/prisma';

const router = Router();
const prisma = new PrismaClient();

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
    const userParticipant = await prisma.groupChatParticipant.findFirst({
      where: {
        group_chat_id: chatId,
        user_id: userId
      }
    });

    if (!userParticipant) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    // Get all participants
    const groupParticipants = await prisma.groupChatParticipant.findMany({
      where: {
        group_chat_id: chatId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
            created_at: true,
            updated_at: true
          }
        }
      },
      orderBy: { joined_at: 'asc' }
    });

    // Format participants
    const formattedParticipants = groupParticipants.map(participant => ({
      id: participant.user.id,
      name: participant.user.name,
      email: participant.user.email,
      avatar: participant.user.avatar,
      status: participant.user.status,
      created_at: participant.user.created_at,
      updated_at: participant.user.updated_at,
      role: participant.role,
      joined_at: participant.joined_at
    }));

    return res.json({
      success: true,
      data: formattedParticipants
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
    const userParticipant = await prisma.groupChatParticipant.findFirst({
      where: {
        group_chat_id: chatId,
        user_id: userId
      },
      select: { role: true }
    });

    if (!userParticipant || userParticipant.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can add participants'
      } as ApiResponse);
    }

    // Check if chat is a group
    const groupChat = await prisma.groupChat.findUnique({
      where: { id: chatId }
    });

    if (!groupChat) {
      return res.status(400).json({
        success: false,
        error: 'Can only add participants to group chats'
      } as ApiResponse);
    }

    // Check if user already exists
    const existingParticipant = await prisma.groupChatParticipant.findFirst({
      where: {
        group_chat_id: chatId,
        user_id: newUserId
      }
    });

    if (existingParticipant) {
      return res.status(400).json({
        success: false,
        error: 'User is already a participant'
      } as ApiResponse);
    }

    // Add participant
    await prisma.groupChatParticipant.create({
      data: {
        id: uuidv4(),
        group_chat_id: chatId,
        user_id: newUserId,
        role: 'member'
      }
    });

    // Get added user info
    const user = await prisma.user.findUnique({
      where: { id: newUserId },
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
    const userParticipant = await prisma.groupChatParticipant.findFirst({
      where: {
        group_chat_id: chatId,
        user_id: userId
      },
      select: { role: true }
    });

    if (!userParticipant) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    // Only admins can remove others, users can remove themselves
    if (participantId !== userId && userParticipant.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can remove other participants'
      } as ApiResponse);
    }

    // Check if chat is a group
    const groupChat = await prisma.groupChat.findUnique({
      where: { id: chatId }
    });

    if (!groupChat) {
      return res.status(400).json({
        success: false,
        error: 'Can only remove participants from group chats'
      } as ApiResponse);
    }

    // Remove participant
    await prisma.groupChatParticipant.deleteMany({
      where: {
        group_chat_id: chatId,
        user_id: participantId
      }
    });

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
    const userParticipant = await prisma.groupChatParticipant.findFirst({
      where: {
        group_chat_id: chatId,
        user_id: userId
      },
      select: { role: true }
    });

    if (!userParticipant || userParticipant.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can update roles'
      } as ApiResponse);
    }

    // Check if chat is a group
    const groupChat = await prisma.groupChat.findUnique({
      where: { id: chatId }
    });

    if (!groupChat) {
      return res.status(400).json({
        success: false,
        error: 'Can only update roles in group chats'
      } as ApiResponse);
    }

    // Update role
    await prisma.groupChatParticipant.updateMany({
      where: {
        group_chat_id: chatId,
        user_id: participantId
      },
      data: { role }
    });

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
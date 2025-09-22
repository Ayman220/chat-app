import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, Message, MessageWithSender, ApiResponse, PaginatedResponse } from '../types';
import { PrismaClient } from '../generated/prisma';

const router = Router();
const prisma = new PrismaClient();

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

    // Check if user is participant (try both direct and group chats)
    const [directChat, groupChat] = await Promise.all([
      prisma.directChat.findUnique({
        where: { id: chatId },
        select: { sender_id: true, recipient_id: true }
      }),
      prisma.groupChat.findUnique({
        where: { id: chatId },
        include: {
          participants: {
            where: { user_id: userId },
            select: { role: true }
          }
        }
      })
    ]);

    let isParticipant = false;
    let chatType = '';

    if (directChat) {
      isParticipant = directChat.sender_id === userId || directChat.recipient_id === userId;
      chatType = 'direct';
    } else if (groupChat) {
      isParticipant = groupChat.participants.length > 0;
      chatType = 'group';
    }

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let total: number;
    let messages: any[];

    if (chatType === 'direct') {
      // Get direct messages
      [total, messages] = await Promise.all([
        prisma.directMessage.count({
          where: { direct_chat_id: chatId }
        }),
        prisma.directMessage.findMany({
          where: { direct_chat_id: chatId },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true,
                last_seen: true,
                created_at: true,
                updated_at: true
              }
            }
          },
          orderBy: { created_at: 'desc' },
          skip: offset,
          take: parseInt(limit as string)
        })
      ]);
    } else {
      // Get group messages
      [total, messages] = await Promise.all([
        prisma.groupMessage.count({
          where: { group_chat_id: chatId }
        }),
        prisma.groupMessage.findMany({
          where: { group_chat_id: chatId },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true,
                last_seen: true,
                created_at: true,
                updated_at: true
              }
            }
          },
          orderBy: { created_at: 'desc' },
          skip: offset,
          take: parseInt(limit as string)
        })
      ]);
    }

    // Format messages
    const formattedMessages = messages.map((msg: any) => ({
      id: msg.id,
      content: msg.content,
      sender_id: msg.sender_id,
      chat_id: chatType === 'direct' ? msg.direct_chat_id : msg.group_chat_id,
      read: chatType === 'direct' ? Boolean(msg.read) : false, // Group messages don't have individual read status
      delivered: chatType === 'direct' ? Boolean(msg.delivered) : false, // Group messages don't have individual delivered status
      created_at: msg.created_at,
      updated_at: msg.updated_at,
      sender: {
        id: msg.sender.id,
        name: msg.sender.name,
        email: msg.sender.email,
        avatar: msg.sender.avatar,
        status: msg.sender.status,
        last_seen: msg.sender.last_seen,
        created_at: msg.sender.created_at,
        updated_at: msg.sender.updated_at
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

    // Check if user is participant (try both direct and group chats)
    const [directChat, groupChat] = await Promise.all([
      prisma.directChat.findUnique({
        where: { id: chatId },
        select: { sender_id: true, recipient_id: true }
      }),
      prisma.groupChat.findUnique({
        where: { id: chatId },
        include: {
          participants: {
            where: { user_id: userId },
            select: { role: true }
          }
        }
      })
    ]);

    let isParticipant = false;
    let chatType = '';

    if (directChat) {
      isParticipant = directChat.sender_id === userId || directChat.recipient_id === userId;
      chatType = 'direct';
    } else if (groupChat) {
      isParticipant = groupChat.participants.length > 0;
      chatType = 'group';
    }

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    // Create message
    const messageId = uuidv4();
    let newMessage: any;

    if (chatType === 'direct') {
      newMessage = await prisma.directMessage.create({
        data: {
          id: messageId,
          content: content.trim(),
          sender_id: userId,
          direct_chat_id: chatId,
          delivered: false
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              status: true,
              last_seen: true,
              created_at: true,
              updated_at: true
            }
          }
        }
      });

      // Update direct chat's updated_at timestamp
      await prisma.directChat.update({
        where: { id: chatId },
        data: { updated_at: new Date() }
      });
    } else {
      newMessage = await prisma.groupMessage.create({
        data: {
          id: messageId,
          content: content.trim(),
          sender_id: userId,
          group_chat_id: chatId
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              status: true,
              last_seen: true,
              created_at: true,
              updated_at: true
            }
          }
        }
      });

      // Update group chat's updated_at timestamp
      await prisma.groupChat.update({
        where: { id: chatId },
        data: { updated_at: new Date() }
      });
    }

    const formattedMessage: MessageWithSender = {
      id: newMessage.id,
      content: newMessage.content,
      sender_id: newMessage.sender_id,
      chat_id: chatType === 'direct' ? newMessage.direct_chat_id : newMessage.group_chat_id,
      read: chatType === 'direct' ? Boolean(newMessage.read) : false,
      delivered: chatType === 'direct' ? Boolean(newMessage.delivered) : false,
      created_at: newMessage.created_at,
      updated_at: newMessage.updated_at,
      sender: {
        id: newMessage.sender.id,
        name: newMessage.sender.name,
        email: newMessage.sender.email,
        avatar: newMessage.sender.avatar,
        status: newMessage.sender.status,
        last_seen: newMessage.sender.last_seen,
        created_at: newMessage.sender.created_at,
        updated_at: newMessage.sender.updated_at
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

    // Check if user is participant (try both direct and group chats)
    const [directChat, groupChat] = await Promise.all([
      prisma.directChat.findUnique({
        where: { id: chatId },
        select: { sender_id: true, recipient_id: true }
      }),
      prisma.groupChat.findUnique({
        where: { id: chatId },
        include: {
          participants: {
            where: { user_id: userId },
            select: { role: true }
          }
        }
      })
    ]);

    let isParticipant = false;
    let chatType = '';

    if (directChat) {
      isParticipant = directChat.sender_id === userId || directChat.recipient_id === userId;
      chatType = 'direct';
    } else if (groupChat) {
      isParticipant = groupChat.participants.length > 0;
      chatType = 'group';
    }

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    // Mark all unread messages as read
    if (chatType === 'direct') {
      await prisma.directMessage.updateMany({
        where: {
          direct_chat_id: chatId,
          sender_id: { not: userId },
          read: false
        },
        data: { read: true }
      });
    } else {
      // For group messages, add user to readBy array
      await prisma.groupMessage.updateMany({
        where: {
          group_chat_id: chatId,
          sender_id: { not: userId },
          readBy: {
            not: {
              path: '$',
              array_contains: userId
            }
          }
        },
        data: {
          readBy: {
            push: userId
          }
        }
      });
    }

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

    // Check if user is participant (try both direct and group chats)
    const [directChat, groupChat] = await Promise.all([
      prisma.directChat.findUnique({
        where: { id: chatId },
        select: { sender_id: true, recipient_id: true }
      }),
      prisma.groupChat.findUnique({
        where: { id: chatId },
        include: {
          participants: {
            where: { user_id: userId },
            select: { role: true }
          }
        }
      })
    ]);

    let isParticipant = false;
    let chatType = '';

    if (directChat) {
      isParticipant = directChat.sender_id === userId || directChat.recipient_id === userId;
      chatType = 'direct';
    } else if (groupChat) {
      isParticipant = groupChat.participants.length > 0;
      chatType = 'group';
    }

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    // Check if user is the sender and message exists
    let message: any;

    if (chatType === 'direct') {
      message = await prisma.directMessage.findFirst({
        where: {
          id: messageId,
          direct_chat_id: chatId
        },
        select: { sender_id: true }
      });
    } else {
      message = await prisma.groupMessage.findFirst({
        where: {
          id: messageId,
          group_chat_id: chatId
        },
        select: { sender_id: true }
      });
    }

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
    if (chatType === 'direct') {
      await prisma.directMessage.delete({
        where: { id: messageId }
      });
    } else {
      await prisma.groupMessage.delete({
        where: { id: messageId }
      });
    }

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
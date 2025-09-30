import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, UserWithoutPassword, ApiResponse } from '../types';
import { PrismaClient } from '../generated/prisma';
import { emitNewChatCreated } from '../socket/socketManager';
import fcmService from '../services/fcm';

const router = Router();
const prisma = new PrismaClient();

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

    // Get direct chats (private)
    const directChats = await prisma.directChat.findMany({
      where: {
        OR: [
          { sender_id: userId },
          { recipient_id: userId }
        ]
      },
      include: {
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: {
            content: true,
            created_at: true,
            read: true,
            sender_id: true
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: { updated_at: 'desc' }
    });

    // Get group chats
    const groupChats = await prisma.groupChat.findMany({
      where: {
        participants: {
          some: {
            user_id: userId
          }
        }
      },
      include: {
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: {
            content: true,
            created_at: true
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: { updated_at: 'desc' }
    });

    // Transform direct chats to match expected format
    const transformedDirectChats = directChats.map(chat => ({
      id: chat.id,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
      type: 'private',
      name: null,
      message_count: chat._count.messages,
      unread_count: 0, // Will be calculated separately
      last_message_content: chat.messages[0]?.content || null,
      last_message_time: chat.messages[0]?.created_at || null
    }));

    // Transform group chats to match expected format
    const transformedGroupChats = groupChats.map(chat => ({
      id: chat.id,
      name: chat.name,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
      type: 'group',
      message_count: chat._count.messages,
      unread_count: 0,
      last_message_content: chat.messages[0]?.content || null,
      last_message_time: chat.messages[0]?.created_at || null
    }));

    // Combine and sort all chats
    const allChats = [...transformedDirectChats, ...transformedGroupChats].sort((a, b) => {
      const aTime = a.last_message_time || a.updated_at;
      const bTime = b.last_message_time || b.updated_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    // For private chats, get the other participant
    const chatsWithParticipants = await Promise.all(
      allChats.map(async (chat: any) => {
        if (chat.type === 'private') {
          // Get the other user in the direct chat
          const directChat = await prisma.directChat.findUnique({
            where: { id: chat.id },
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true,
                  status: true
                }
              },
              recipient: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true,
                  status: true
                }
              }
            }
          });

          const otherParticipant = directChat?.sender_id === userId
            ? directChat.recipient
            : directChat?.sender;

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

    // First, try to find as direct chat
    const directChat = await prisma.directChat.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true
          }
        },
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true
          }
        }
      }
    });

    if (directChat) {
      // Check if user is participant
      if (directChat.sender_id !== userId && directChat.recipient_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      const otherParticipant = directChat.sender_id === userId
        ? directChat.recipient
        : directChat.sender;

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
            id: otherParticipant.id,
            role: 'member'
          }
        ],
        other_participant: otherParticipant
      };

      return res.json({
        success: true,
        data: chatWithParticipants
      } as ApiResponse<any>);
    }

    // If not found as direct chat, try as group chat
    const groupChat = await prisma.groupChat.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (groupChat) {
      // Check if user is participant
      const userParticipant = groupChat.participants.find(p => p.user_id === userId);

      if (!userParticipant) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      const chatWithParticipants = {
        id: groupChat.id,
        name: groupChat.name,
        description: groupChat.description,
        avatar: groupChat.avatar,
        type: 'group',
        created_at: groupChat.created_at,
        updated_at: groupChat.updated_at,
        participants: groupChat.participants.map(p => ({
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
          avatar: p.user.avatar,
          status: p.user.status,
          role: p.role
        }))
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
      const existingDirectChat = await prisma.directChat.findFirst({
        where: {
          OR: [
            { sender_id: userId, recipient_id: otherUserId },
            { sender_id: otherUserId, recipient_id: userId }
          ]
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              status: true
            }
          },
          recipient: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              status: true
            }
          },
          messages: {
            orderBy: { created_at: 'desc' },
            take: 1,
            select: {
              content: true,
              created_at: true,
              read: true,
              sender_id: true
            }
          },
          _count: {
            select: {
              messages: true
            }
          }
        }
      });

      if (existingDirectChat) {
        // Return existing chat
        const otherParticipant = existingDirectChat.sender_id === userId
          ? existingDirectChat.recipient
          : existingDirectChat.sender;

        const stats = {
          message_count: existingDirectChat._count.messages,
          unread_count: 0, // Will be calculated separately
          last_message_content: existingDirectChat.messages[0]?.content || null,
          last_message_time: existingDirectChat.messages[0]?.created_at || null
        };

        return res.status(200).json({
          success: true,
          data: {
            id: existingDirectChat.id,
            type: 'private',
            name: null,
            created_at: existingDirectChat.created_at,
            updated_at: existingDirectChat.updated_at,
            message_count: stats.message_count,
            unread_count: stats.unread_count,
            last_message_content: stats.last_message_content,
            last_message_time: stats.last_message_time,
            other_participant: otherParticipant,
            last_message: stats.last_message_content ? {
              content: stats.last_message_content,
              created_at: stats.last_message_time
            } : null
          }
        } as ApiResponse<any>);
      }

      // Create new direct chat
      chatId = uuidv4();
      const newDirectChat = await prisma.directChat.create({
        data: {
          id: chatId,
          sender_id: userId,
          recipient_id: otherUserId
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              status: true
            }
          },
          recipient: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              status: true
            }
          }
        }
      });

      const otherParticipant = newDirectChat.recipient;

      chatData = {
        id: newDirectChat.id,
        type: 'private',
        name: null,
        created_at: newDirectChat.created_at,
        updated_at: newDirectChat.updated_at,
        message_count: 0,
        unread_count: 0,
        last_message_content: null,
        last_message_time: null,
        other_participant: otherParticipant,
        last_message: null
      };

      // Notify the recipient about the new chat
      await emitNewChatCreated(chatId, otherUserId, 'direct');

    } else if (type === 'group') {
      // Create new group chat
      chatId = uuidv4();
      const allParticipants = [userId, ...participants];

      const newGroupChat = await prisma.groupChat.create({
        data: {
          id: chatId,
          name,
          created_by: userId,
          participants: {
            create: allParticipants.map(participantId => ({
              id: uuidv4(),
              user_id: participantId,
              role: participantId === userId ? 'admin' : 'member'
            }))
          }
        }
      });

      chatData = {
        id: newGroupChat.id,
        name: newGroupChat.name,
        type: 'group',
        created_at: newGroupChat.created_at,
        updated_at: newGroupChat.updated_at,
        message_count: 0,
        unread_count: 0,
        last_message_content: null,
        last_message_time: null,
        last_message: null
      };

      // Notify all participants except the creator about the new group chat
      for (const participantId of participants) {
        await emitNewChatCreated(chatId, participantId, 'group');
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid chat type'
      } as ApiResponse);
    }

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

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // First, try to find as direct chat
    const directChat = await prisma.directChat.findUnique({
      where: { id }
    });

    if (directChat) {
      return res.status(400).json({
        success: false,
        error: 'Cannot update direct chats'
      } as ApiResponse);
    }

    // If not found as direct chat, try as group chat
    const groupChat = await prisma.groupChat.findUnique({
      where: { id },
      include: {
        participants: {
          where: { user_id: userId },
          select: { role: true }
        }
      }
    });

    if (groupChat) {
      // Check if user is admin
      const participant = groupChat.participants[0];

      if (!participant || participant.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Only admins can update chat'
        } as ApiResponse);
      }

      // Update group chat
      const updatedGroupChat = await prisma.groupChat.update({
        where: { id },
        data: { name }
      });

      return res.json({
        success: true,
        data: {
          id: updatedGroupChat.id,
          name: updatedGroupChat.name,
          type: 'group',
          created_at: updatedGroupChat.created_at,
          updated_at: updatedGroupChat.updated_at
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
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // First, try to find as direct chat
    const directChat = await prisma.directChat.findUnique({
      where: { id }
    });

    if (directChat) {
      // Check if user is participant
      if (directChat.sender_id !== userId && directChat.recipient_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Delete direct chat (cascade will handle related records)
      await prisma.directChat.delete({
        where: { id }
      });

      return res.json({
        success: true,
        message: 'Direct chat deleted successfully'
      } as ApiResponse);
    }

    // If not found as direct chat, try as group chat
    const groupChat = await prisma.groupChat.findUnique({
      where: { id },
      include: {
        participants: {
          where: { user_id: userId },
          select: { role: true }
        }
      }
    });

    if (groupChat) {
      // Check if user is admin
      const participant = groupChat.participants[0];

      if (!participant || participant.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Only admins can delete chat'
        } as ApiResponse);
      }

      // Delete group chat (cascade will handle related records)
      await prisma.groupChat.delete({
        where: { id }
      });

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
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // First, try to find as direct chat
    const directChat = await prisma.directChat.findUnique({
      where: { id: chatId }
    });

    if (directChat) {
      // Check if user is participant
      if (directChat.sender_id !== userId && directChat.recipient_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      // Get total count and messages for direct chat
      const [total, messages] = await Promise.all([
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
                status: true
              }
            }
          },
          orderBy: { created_at: 'desc' },
          skip: offset,
          take: parseInt(limit as string)
        })
      ]);

      // Format messages
      const formattedMessages = messages.map(msg => ({
        id: msg.id,
        content: msg.content,
        sender_id: msg.sender_id,
        chat_id: msg.direct_chat_id,
        read: Boolean(msg.read),
        delivered: Boolean(msg.delivered),
        created_at: msg.created_at,
        updated_at: msg.updated_at,
        sender: {
          id: msg.sender.id,
          name: msg.sender.name,
          email: msg.sender.email,
          avatar: msg.sender.avatar,
          status: msg.sender.status,
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
    const groupChat = await prisma.groupChat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          where: { user_id: userId },
          select: { role: true }
        }
      }
    });

    if (groupChat) {
      // Check if user is participant
      if (groupChat.participants.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      // Get total count and messages for group chat
      const [total, messages] = await Promise.all([
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
                status: true
              }
            }
          },
          orderBy: { created_at: 'desc' },
          skip: offset,
          take: parseInt(limit as string)
        })
      ]);

      // Format messages
      const formattedMessages = messages.map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        sender_id: msg.sender_id,
        chat_id: msg.group_chat_id,
        read: false, // Group messages don't have individual read status
        read_by_recipient: false,
        delivered: [],
        created_at: msg.created_at,
        updated_at: msg.updated_at,
        sender: {
          id: msg.sender.id,
          name: msg.sender.name,
          email: msg.sender.email,
          avatar: msg.sender.avatar,
          status: msg.sender.status,
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
    const directChat = await prisma.directChat.findUnique({
      where: { id: chatId }
    });

    if (directChat) {
      // Check if user is participant
      if (directChat.sender_id !== userId && directChat.recipient_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Create direct message
      const messageId = uuidv4();
      const newMessage = await prisma.directMessage.create({
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
              status: true
            }
          }
        }
      });

      // Update direct chat's updated_at timestamp
      await prisma.directChat.update({
        where: { id: chatId },
        data: { updated_at: new Date() }
      });

      const formattedMessage = {
        id: newMessage.id,
        content: newMessage.content,
        sender_id: newMessage.sender_id,
        chat_id: newMessage.direct_chat_id,
        read: Boolean(newMessage.read),
        delivered: Boolean(newMessage.delivered),
        created_at: newMessage.created_at,
        updated_at: newMessage.updated_at,
        sender: {
          id: newMessage.sender.id,
          name: newMessage.sender.name,
          email: newMessage.sender.email,
          avatar: newMessage.sender.avatar,
          status: newMessage.sender.status,
          created_at: newMessage.created_at,
          updated_at: newMessage.updated_at
        }
      };

      // Send FCM notification asynchronously (don't await)
      const recipientId = directChat.sender_id === userId ? directChat.recipient_id : directChat.sender_id;

      // Fire and forget - don't block the response
      fcmService.sendMessageNotification(recipientId, {
        chatId,
        chatType: 'direct',
        senderName: newMessage.sender.name,
        messageContent: newMessage.content,
        senderAvatar: newMessage.sender.avatar || undefined
      }).catch(error => {
        console.error('FCM notification error (async):', error);
      });

      return res.status(201).json({
        success: true,
        data: formattedMessage
      } as ApiResponse<any>);
    }

    // If not found as direct chat, try as group chat
    const groupChat = await prisma.groupChat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          where: { user_id: userId },
          select: { role: true }
        }
      }
    });

    if (groupChat) {
      // Check if user is participant
      if (groupChat.participants.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Create group message
      const messageId = uuidv4();
      const newMessage = await prisma.groupMessage.create({
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
              status: true
            }
          }
        }
      });

      // Update group chat's updated_at timestamp
      await prisma.groupChat.update({
        where: { id: chatId },
        data: { updated_at: new Date() }
      });

      const formattedMessage = {
        id: newMessage.id,
        content: newMessage.content,
        sender_id: newMessage.sender_id,
        chat_id: newMessage.group_chat_id,
        read: false, // Group messages don't have individual read status
        read_by_recipient: false,
        delivered: [],
        created_at: newMessage.created_at,
        updated_at: newMessage.updated_at,
        sender: {
          id: newMessage.sender.id,
          name: newMessage.sender.name,
          email: newMessage.sender.email,
          avatar: newMessage.sender.avatar,
          status: newMessage.sender.status,
          created_at: newMessage.created_at,
          updated_at: newMessage.updated_at
        }
      };

      // Send FCM notification asynchronously (don't await)
      // Fire and forget - don't block the response
      fcmService.sendGroupMessageNotification(groupChat.id, userId, {
        senderName: newMessage.sender.name,
        messageContent: newMessage.content,
        senderAvatar: newMessage.sender.avatar || undefined
      }).catch(error => {
        console.error('FCM notification error (async):', error);
      });

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

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      } as ApiResponse);
    }

    // First, try to find as direct chat
    const directChat = await prisma.directChat.findUnique({
      where: { id: chatId }
    });

    if (directChat) {
      // Check if user is participant
      if (directChat.sender_id !== userId && directChat.recipient_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Get all messages that will be marked as read
      const messagesToMark = await prisma.directMessage.findMany({
        where: {
          direct_chat_id: chatId,
          sender_id: { not: userId },
          read: false
        },
        select: { id: true }
      });

      // Mark all unread direct messages as read
      await prisma.directMessage.updateMany({
        where: {
          direct_chat_id: chatId,
          sender_id: { not: userId },
          read: false
        },
        data: { read: true }
      });

      // Emit socket events for each message that was marked as read
      try {
        const { safeEmit } = require('../socket/socketManager');

        if (messagesToMark.length > 0) {
          for (const message of messagesToMark) {
            safeEmit('message:read', {
              chatId: chatId,
              messageId: message.id,
              userId: userId
            }, chatId);
          }
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
    const groupChat = await prisma.groupChat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          where: { user_id: userId },
          select: { role: true }
        }
      }
    });

    if (groupChat) {
      // Check if user is participant
      if (groupChat.participants.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
      }

      // Get all messages that will be marked as read
      const messagesToMark = await prisma.groupMessage.findMany({
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
        select: { id: true }
      });

      // Mark all unread group messages as read by adding user to readBy array
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

      // Emit socket events for each message that was marked as read
      try {
        const { safeEmit } = require('../socket/socketManager');

        if (messagesToMark.length > 0) {
          for (const message of messagesToMark) {
            safeEmit('message:read', {
              chatId: chatId,
              messageId: message.id,
              userId: userId
            }, chatId);
          }
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
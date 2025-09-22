import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { AuthenticatedSocket, JWTPayload, UserWithoutPassword, MessageWithSender } from '../types';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

interface ConnectedUser {
  userId: string;
  socketId: string;
  user: UserWithoutPassword;
}

const connectedUsers = new Map<string, ConnectedUser>();

let globalIo: Server;

export const initializeSocket = (io: Server): void => {
  globalIo = io;
  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as JWTPayload;

      try {
        // Get user from database
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
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
        });

        if (!user) {
          return next(new Error('User not found'));
        }

        socket.user = user;
        next();
      } catch (dbError: any) {
        next(new Error('Authentication error'));
      }
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    // Add user to connected users
    if (socket.user) {
      connectedUsers.set(socket.user.id, {
        userId: socket.user.id,
        socketId: socket.id,
        user: socket.user
      });

      // Broadcast user online status to other users
      socket.broadcast.emit('user:online', {
        userId: socket.user.id,
        user: socket.user
      });

      // Send current online users to the newly connected user
      const currentOnlineUsers = Array.from(connectedUsers.values()).map(connectedUser => ({
        id: connectedUser.user.id,
        name: connectedUser.user.name,
        email: connectedUser.user.email,
        avatar: connectedUser.user.avatar,
        status: connectedUser.user.status,
        created_at: connectedUser.user.created_at,
        updated_at: connectedUser.user.updated_at
      }));

      socket.emit('users:online', currentOnlineUsers);

      // Mark all received messages as delivered for this user
      markAllMessagesAsDeliveredForUser(socket.user.id).catch(error => {
        console.error('Error in markAllMessagesAsDeliveredForUser:', error);
      });
    }

    // Join chat room
    socket.on('join_chat', async (data: { chatId: string }) => {
      socket.join(data.chatId);

      // Update delivery status for messages sent while user was offline
      if (socket.user) {
        try {
          await updateDeliveryStatusForUser(data.chatId, socket.user.id);
        } catch (error) {
          console.error('Error updating delivery status for user:', error);
        }
      }
    });

    // Leave chat room
    socket.on('leave_chat', (data: { chatId: string }) => {
      socket.leave(data.chatId);
    });

    // Handle new message
    socket.on('new_message', async (data: { chatId: string; message: MessageWithSender }) => {
      try {
        // Broadcast message to all users in the chat
        socket.to(data.chatId).emit('new_message', data);

        // Update delivery status for online users who are not actively viewing the chat
        await updateMessageDeliveryStatus(data.chatId, data.message.id, data.message.sender_id);
      } catch (error) {
        console.error('Error handling new message:', error);
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data: { chatId: string; userId: string }) => {
      socket.to(data.chatId).emit('typing_start', data);
    });

    socket.on('typing_stop', (data: { chatId: string; userId: string }) => {
      socket.to(data.chatId).emit('typing_stop', data);
    });

    // Handle message read
    socket.on('message:read', async (data: { messageId: string }) => {
      try {
        // First, try to find as direct message
        const directMessage = await prisma.directMessage.findUnique({
          where: { id: data.messageId },
          select: { direct_chat_id: true }
        });

        if (directMessage) {
          // Update direct message read status
          await prisma.directMessage.update({
            where: { id: data.messageId },
            data: { read: true }
          });

          // Broadcast read status
          socket.to(directMessage.direct_chat_id).emit('message:read', {
            chatId: directMessage.direct_chat_id,
            messageId: data.messageId
          });
        } else {
          // Try to find as group message
          const groupMessage = await prisma.groupMessage.findUnique({
            where: { id: data.messageId },
            select: { group_chat_id: true, readBy: true }
          });

          if (groupMessage) {
            // Update group message read status
            let readBy = groupMessage.readBy ? groupMessage.readBy as string[] : [];
            if (!readBy.includes(socket.user?.id || '')) {
              readBy.push(socket.user?.id || '');
              await prisma.groupMessage.update({
                where: { id: data.messageId },
                data: { readBy: readBy }
              });
            }

            // Broadcast read status
            socket.to(groupMessage.group_chat_id).emit('message:read', {
              chatId: groupMessage.group_chat_id,
              messageId: data.messageId
            });
          }
        }
      } catch (error: any) {
        console.error('Error handling message read:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      if (socket.user) {
        // Remove user from connected users
        connectedUsers.delete(socket.user.id);

        // Update last_seen in database
        try {
          await prisma.user.update({
            where: { id: socket.user.id },
            data: { last_seen: new Date() }
          });
        } catch (error) {
          console.error('Error updating last_seen:', error);
        }

        // Broadcast user offline status with last seen timestamp
        socket.broadcast.emit('user:offline', {
          userId: socket.user.id,
          lastSeen: new Date().toISOString()
        });
      }
    });
  });
};

// Helper function to update message delivery status
const updateMessageDeliveryStatus = async (chatId: string, messageId: string, senderId: string): Promise<void> => {
  try {
    // Check if it's a direct chat
    const directChat = await prisma.directChat.findUnique({
      where: { id: chatId },
      select: { sender_id: true, recipient_id: true }
    });

    if (directChat) {
      // Handle direct chat participants
      const participantIds = [directChat.sender_id, directChat.recipient_id];

      // Find online participants by checking both connectedUsers map and actual socket connection
      // IMPORTANT: Exclude the sender from delivery status - only recipients matter for delivery
      const onlineParticipants = participantIds.filter((id: string) => {
        // Skip the sender - delivery status is only for recipients
        if (id === senderId) return false;

        const connectedUser = connectedUsers.get(id);
        if (!connectedUser) return false;

        // Verify the socket is still connected
        const socket = globalIo.sockets.sockets.get(connectedUser.socketId);
        return socket && socket.connected;
      });

      // Update delivery status for direct messages
      if (onlineParticipants.length > 0) {
        await prisma.directMessage.update({
          where: { id: messageId },
          data: { delivered: true }
        });

        // Emit delivery event to notify the sender
        globalIo.to(chatId).emit('message:delivered', {
          chatId: chatId,
          messageId: messageId,
          delivered: onlineParticipants[0] // For direct chat, there's only one recipient
        });
      }
    } else {
      // Handle group chat participants
      const participants = await prisma.groupChatParticipant.findMany({
        where: { group_chat_id: chatId },
        select: { user_id: true }
      });

      const participantIds = participants.map((p: any) => p.user_id);

      // Find online participants by checking both connectedUsers map and actual socket connection
      // IMPORTANT: Exclude the sender from delivery status - only recipients matter for delivery
      const onlineParticipants = participantIds.filter((id: string) => {
        // Skip the sender - delivery status is only for recipients
        if (id === senderId) return false;

        const connectedUser = connectedUsers.get(id);
        if (!connectedUser) return false;

        // Verify the socket is still connected
        const socket = globalIo.sockets.sockets.get(connectedUser.socketId);
        return socket && socket.connected;
      });

      // Update delivery status for group messages
      if (onlineParticipants.length > 0) {
        await prisma.groupMessage.update({
          where: { id: messageId },
          data: { deliveredTo: onlineParticipants }
        });

        // Emit delivery event for each online participant
        onlineParticipants.forEach((participantId: string) => {
          globalIo.to(chatId).emit('message:delivered', {
            chatId: chatId,
            messageId: messageId,
            delivered: participantId
          });
        });
      }
    }
  } catch (error: any) {
    console.error('Error updating message delivery status:', error);
  }
};

// Helper function to update delivery status for a specific user when they join a chat
const updateDeliveryStatusForUser = async (chatId: string, userId: string): Promise<void> => {
  try {
    // Check if it's a direct chat
    const directChat = await prisma.directChat.findUnique({
      where: { id: chatId },
      select: { id: true }
    });

    if (directChat) {
      // Handle direct messages
      const messages = await prisma.directMessage.findMany({
        where: {
          direct_chat_id: chatId,
          sender_id: { not: userId },
          delivered: false
        },
        select: { id: true }
      });

      for (const message of messages) {
        // Mark as delivered
        await prisma.directMessage.update({
          where: { id: message.id },
          data: { delivered: true }
        });

        // Emit delivery event to notify other users
        globalIo.to(chatId).emit('message:delivered', {
          chatId: chatId,
          messageId: message.id,
          delivered: userId
        });
      }
    } else {
      // Handle group messages
      const messages = await prisma.groupMessage.findMany({
        where: {
          group_chat_id: chatId,
          sender_id: { not: userId }
        },
        select: { id: true, deliveredTo: true }
      });

      for (const message of messages) {
        let delivered = message.deliveredTo ? message.deliveredTo as string[] : [];

        // Check if user is not already in delivered_to
        if (!delivered.includes(userId)) {
          delivered.push(userId);

          // Update delivered_to array
          await prisma.groupMessage.update({
            where: { id: message.id },
            data: { deliveredTo: delivered }
          });

          // Emit delivery event to notify other users
          globalIo.to(chatId).emit('message:delivered', {
            chatId: chatId,
            messageId: message.id,
            delivered: userId
          });
        }
      }
    }
  } catch (error: any) {
    console.error('Error updating delivery status for user:', error);
  }
};

// Helper function to notify a user about a new chat
export const notifyUserAboutNewChat = async (userId: string, chatId: string, chatType: 'direct' | 'group'): Promise<void> => {
  try {
    // Check if the user is online
    const connectedUser = connectedUsers.get(userId);
    if (!connectedUser) {
      return;
    }

    // Verify the socket is still connected
    const socket = globalIo.sockets.sockets.get(connectedUser.socketId);
    if (!socket || !socket.connected) {
      return;
    }

    // Get chat details for the notification
    let chatDetails: any = null;

    if (chatType === 'direct') {
      // Get direct chat details with participant info
      const directChat = await prisma.directChat.findUnique({
        where: { id: chatId },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              status: true,
              created_at: true,
              updated_at: true
            }
          },
          recipient: {
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
        }
      });

      if (directChat) {
        chatDetails = {
          id: directChat.id,
          type: 'direct',
          created_at: directChat.created_at,
          updated_at: directChat.updated_at,
          // Include the other participant's info
          otherParticipant: directChat.sender.id === userId ? directChat.recipient : directChat.sender
        };
      }
    } else {
      // Get group chat details
      const groupChat = await prisma.groupChat.findUnique({
        where: { id: chatId },
        include: {
          creator: {
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
        }
      });

      if (groupChat) {
        chatDetails = {
          id: groupChat.id,
          type: 'group',
          name: groupChat.name,
          description: groupChat.description,
          avatar: groupChat.avatar,
          created_at: groupChat.created_at,
          updated_at: groupChat.updated_at,
          creator: groupChat.creator
        };
      }
    }

    if (chatDetails) {
      // Emit new chat notification to the user
      socket.emit('new_chat_notification', {
        chatId: chatId,
        chatType: chatType,
        chatDetails: chatDetails
      });
    }
  } catch (error: any) {
    console.error('Error notifying user about new chat:', error);
  }
};

// Helper function to get online users
export const getOnlineUsers = (): UserWithoutPassword[] => {
  return Array.from(connectedUsers.values()).map(user => user.user);
};

// Helper function to check if user is online
export const isUserOnline = (userId: string): boolean => {
  return connectedUsers.has(userId);
};

// Helper function to get user's socket
export const getUserSocket = (userId: string, io: Server): Socket | null => {
  const connectedUser = connectedUsers.get(userId);
  return connectedUser ? io.sockets.sockets.get(connectedUser.socketId) || null : null;
};

// Helper function to get global Io instance
export const getGlobalIo = (): Server | undefined => {
  return globalIo;
};

// Helper function to emit new chat creation event
export const emitNewChatCreated = async (chatId: string, recipientId: string, chatType: 'direct' | 'group'): Promise<void> => {
  try {
    // Directly notify the user about the new chat
    await notifyUserAboutNewChat(recipientId, chatId, chatType);
  } catch (error) {
    console.error('Socket: Error emitting new chat created event:', error);
  }
};

// Helper function to safely emit socket events
export const safeEmit = (event: string, data: any, room?: string): void => {
  try {
    if (globalIo) {
      if (room) {
        globalIo.to(room).emit(event, data);
      } else {
        globalIo.emit(event, data);
      }
    } else {
      console.warn('Socket: No globalIo instance available');
    }
  } catch (error) {
    console.error('Socket: Error emitting event:', error);
  }
};

// Helper function to mark all messages as delivered for a user when they log in
export const markAllMessagesAsDeliveredForUser = async (userId: string): Promise<void> => {
  try {
    // Get all direct chats where the user is a participant
    const directChats = await prisma.directChat.findMany({
      where: {
        OR: [
          { sender_id: userId },
          { recipient_id: userId }
        ]
      },
      select: { id: true }
    });

    // Get all group chats where the user is a participant
    const groupChats = await prisma.groupChatParticipant.findMany({
      where: { user_id: userId },
      select: { group_chat_id: true }
    });

    // Combine all chats
    const allChats = [
      ...directChats.map(chat => ({ chat_id: chat.id })),
      ...groupChats.map(chat => ({ chat_id: chat.group_chat_id }))
    ];

    for (const chat of allChats) {
      // Check if it's a direct chat
      const directChat = await prisma.directChat.findUnique({
        where: { id: chat.chat_id },
        select: { id: true }
      });

      if (directChat) {
        // Handle direct messages
        const messages = await prisma.directMessage.findMany({
          where: {
            direct_chat_id: chat.chat_id,
            sender_id: { not: userId },
            delivered: false
          },
          select: { id: true }
        });

        for (const message of messages) {
          // Mark as delivered
          await prisma.directMessage.update({
            where: { id: message.id },
            data: { delivered: true }
          });

          // Emit delivery event to notify other users
          globalIo.to(chat.chat_id).emit('message:delivered', {
            chatId: chat.chat_id,
            messageId: message.id,
            delivered: userId
          });
        }
      } else {
        // Handle group messages
        const messages = await prisma.groupMessage.findMany({
          where: {
            group_chat_id: chat.chat_id,
            sender_id: { not: userId }
          },
          select: { id: true, deliveredTo: true }
        });

        for (const message of messages) {
          let delivered = message.deliveredTo ? message.deliveredTo as string[] : [];

          // Check if user is not already in delivered_to
          if (!delivered.includes(userId)) {
            delivered.push(userId);

            // Update delivered_to array
            await prisma.groupMessage.update({
              where: { id: message.id },
              data: { deliveredTo: delivered }
            });

            // Emit delivery event to notify other users
            globalIo.to(chat.chat_id).emit('message:delivered', {
              chatId: chat.chat_id,
              messageId: message.id,
              delivered: userId
            });
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Error marking all messages as delivered for user:', error);
  }
}; 
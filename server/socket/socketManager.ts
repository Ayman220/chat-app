import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import pool from '../database/config';
import { AuthenticatedSocket, JWTPayload, UserWithoutPassword, MessageWithSender } from '../types';

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
        const { rows: users } = await pool.query(
          'SELECT id, name, email, avatar, status, created_at, updated_at FROM users WHERE id = $1',
          [decoded.userId]
        );

        const user = users[0] as UserWithoutPassword;

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
    } else {
      console.log('No user found in socket connection');
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
        console.log('📨 NEW MESSAGE HANDLER - Message ID:', data.message.id, 'Chat:', data.chatId, 'Sender:', data.message.sender_id);
        console.log('📨 CURRENT CONNECTED USERS:', Array.from(connectedUsers.keys()));

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
        console.log('📖 MESSAGE READ - Message ID:', data.messageId);

        // First, try to find as direct message
        const { rows: directMessages } = await pool.query(
          'SELECT direct_chat_id as chat_id FROM direct_messages WHERE id = $1',
          [data.messageId]
        );

        if (directMessages.length > 0) {
          const message = directMessages[0];

          // Update direct message read status
          await pool.query(
            'UPDATE direct_messages SET read = true WHERE id = $1',
            [data.messageId]
          );

          // Broadcast read status
          socket.to(message.chat_id).emit('message:read', {
            chatId: message.chat_id,
            messageId: data.messageId
          });
        } else {
          // Try to find as group message
          const { rows: groupMessages } = await pool.query(
            'SELECT group_chat_id as chat_id, read_by FROM group_messages WHERE id = $1',
            [data.messageId]
          );

          if (groupMessages.length > 0) {
            const message = groupMessages[0];

            // Update group message read status
            let readBy = message.read_by ? message.read_by : [];
            if (!readBy.includes(socket.user?.id)) {
              readBy.push(socket.user?.id);
              await pool.query(
                'UPDATE group_messages SET read_by = $1 WHERE id = $2',
                [readBy, data.messageId]
              );
            }

            // Broadcast read status
            socket.to(message.chat_id).emit('message:read', {
              chatId: message.chat_id,
              messageId: data.messageId
            });
          }
        }
      } catch (error: any) {
        console.error('Error handling message read:', error);
      }
    });

    // Handle message delivered - This handler is removed to prevent circular delivery marking
    // The updateMessageDeliveryStatus function handles delivery status updates directly

    // Handle disconnect
    socket.on('disconnect', async () => {
      if (socket.user) {
        // Remove user from connected users
        connectedUsers.delete(socket.user.id);

        // Update last_seen in database
        try {
          await pool.query(
            'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
            [socket.user.id]
          );
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
    console.log('📨 UPDATE MESSAGE DELIVERY - Chat ID:', chatId, 'Message ID:', messageId);

    // Check if it's a direct chat
    const { rows: directChat } = await pool.query(
      'SELECT id FROM direct_chats WHERE id = $1',
      [chatId]
    );

    if (directChat.length > 0) {
      // Handle direct chat participants
      const { rows: directChatData } = await pool.query(
        'SELECT user1_id, user2_id FROM direct_chats WHERE id = $1',
        [chatId]
      );

      if (directChatData.length > 0) {
        const { user1_id, user2_id } = directChatData[0];
        const participantIds = [user1_id, user2_id];

        // Find online participants by checking both connectedUsers map and actual socket connection
        // IMPORTANT: Exclude the sender from delivery status - only recipients matter for delivery
        const onlineParticipants = participantIds.filter(id => {
          // Skip the sender - delivery status is only for recipients
          if (id === senderId) return false;

          const connectedUser = connectedUsers.get(id);
          if (!connectedUser) return false;

          // Verify the socket is still connected
          const socket = globalIo.sockets.sockets.get(connectedUser.socketId);
          return socket && socket.connected;
        });

        console.log('📨 DIRECT CHAT - Participants:', participantIds);
        console.log('📨 DIRECT CHAT - Online participants:', onlineParticipants);
        console.log('📨 DIRECT CHAT - Connected users map:', Array.from(connectedUsers.keys()));

        // Update delivery status for direct messages
        if (onlineParticipants.length > 0) {
          console.log('📨 MARKING AS DELIVERED - Message ID:', messageId);
          await pool.query(
            'UPDATE direct_messages SET delivered = true WHERE id = $1',
            [messageId]
          );

          // Emit delivery event to notify the sender
          globalIo.to(chatId).emit('message:delivered', {
            chatId: chatId,
            messageId: messageId,
            delivered: onlineParticipants[0] // For direct chat, there's only one recipient
          });
        } else {
          console.log('📨 NOT MARKING AS DELIVERED - No online participants for message:', messageId);
        }
      }
    } else {
      // Handle group chat participants
      const { rows: participants } = await pool.query(
        'SELECT user_id FROM group_chat_participants WHERE group_chat_id = $1',
        [chatId]
      );

      const participantIds = participants.map(p => p.user_id);

      // Find online participants by checking both connectedUsers map and actual socket connection
      // IMPORTANT: Exclude the sender from delivery status - only recipients matter for delivery
      const onlineParticipants = participantIds.filter(id => {
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
        await pool.query(
          'UPDATE group_messages SET delivered_to = $1 WHERE id = $2',
          [onlineParticipants, messageId]
        );

        // Emit delivery event for each online participant
        onlineParticipants.forEach(participantId => {
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
    console.log('📨 UPDATE DELIVERY - Chat ID:', chatId, 'User ID:', userId);

    // Check if it's a direct chat
    const { rows: directChat } = await pool.query(
      'SELECT id FROM direct_chats WHERE id = $1',
      [chatId]
    );

    if (directChat.length > 0) {
      // Handle direct messages
      const { rows: messages } = await pool.query(
        'SELECT id FROM direct_messages WHERE direct_chat_id = $1 AND sender_id != $2 AND delivered = false',
        [chatId, userId]
      );

      for (const message of messages) {
        // Mark as delivered
        await pool.query(
          'UPDATE direct_messages SET delivered = true WHERE id = $1',
          [message.id]
        );

        // Emit delivery event to notify other users
        globalIo.to(chatId).emit('message:delivered', {
          chatId: chatId,
          messageId: message.id,
          delivered: userId
        });
      }
    } else {
      // Handle group messages
      const { rows: messages } = await pool.query(
        'SELECT id, delivered_to FROM group_messages WHERE group_chat_id = $1 AND sender_id != $2',
        [chatId, userId]
      );

      for (const message of messages) {
        let delivered = message.delivered_to ? message.delivered_to : [];

        // Check if user is not already in delivered_to
        if (!delivered.includes(userId)) {
          delivered.push(userId);

          // Update delivered_to array
          await pool.query(
            'UPDATE group_messages SET delivered_to = $1 WHERE id = $2',
            [delivered, message.id]
          );

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

// Helper function to safely emit socket events
export const safeEmit = (event: string, data: any, room?: string): void => {
  try {
    console.log('📡 SOCKET safeEmit called:', { event, data, room });

    if (globalIo) {
      if (room) {
        console.log('📡 Emitting to room:', room);
        globalIo.to(room).emit(event, data);
      } else {
        console.log('📡 Emitting globally');
        globalIo.emit(event, data);
      }
      console.log('📡 Event emitted successfully');
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
    console.log('📨 MARK DELIVERED - User ID:', userId);

    // Get all direct chats where the user is a participant
    const { rows: directChats } = await pool.query(
      'SELECT id as chat_id FROM direct_chats WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    // Get all group chats where the user is a participant
    const { rows: groupChats } = await pool.query(
      'SELECT group_chat_id as chat_id FROM group_chat_participants WHERE user_id = $1',
      [userId]
    );

    // Combine all chats
    const allChats = [...directChats, ...groupChats];

    console.log('📨 MARK DELIVERED - Direct chats:', directChats.length);
    console.log('📨 MARK DELIVERED - Group chats:', groupChats.length);
    console.log('📨 MARK DELIVERED - Total chats:', allChats.length);

    for (const chat of allChats) {
      // Check if it's a direct chat
      const { rows: directChat } = await pool.query(
        'SELECT id FROM direct_chats WHERE id = $1',
        [chat.chat_id]
      );

      if (directChat.length > 0) {
        // Handle direct messages
        const { rows: messages } = await pool.query(
          'SELECT id FROM direct_messages WHERE direct_chat_id = $1 AND sender_id != $2 AND delivered = false',
          [chat.chat_id, userId]
        );

        for (const message of messages) {
          // Mark as delivered
          await pool.query(
            'UPDATE direct_messages SET delivered = true WHERE id = $1',
            [message.id]
          );

          // Emit delivery event to notify other users
          globalIo.to(chat.chat_id).emit('message:delivered', {
            chatId: chat.chat_id,
            messageId: message.id,
            delivered: userId
          });
        }
      } else {
        // Handle group messages
        const { rows: messages } = await pool.query(
          'SELECT id, delivered_to FROM group_messages WHERE group_chat_id = $1 AND sender_id != $2',
          [chat.chat_id, userId]
        );

        for (const message of messages) {
          let delivered = message.delivered_to ? message.delivered_to : [];

          // Check if user is not already in delivered_to
          if (!delivered.includes(userId)) {
            delivered.push(userId);

            // Update delivered_to array
            await pool.query(
              'UPDATE group_messages SET delivered_to = $1 WHERE id = $2',
              [delivered, message.id]
            );

            // Emit delivery event to notify other users
            globalIo.to(chat.chat_id).emit('message:delivered', {
              chatId: chat.chat_id,
              messageId: message.id,
              delivered: userId
            });
          } else {
            console.log('Message already delivered to user:', message.id, userId);
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Error marking all messages as delivered for user:', error);
  }
}; 
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
  console.log('SocketManager: Initializing socket manager...');
  globalIo = io;
  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      console.log('Socket auth: Token provided =', !!token);
      
      if (!token) {
        console.log('Socket auth: No token provided');
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as JWTPayload;
      console.log('Socket auth: Token decoded for user:', decoded.userId);
      
      try {
        // Get user from database
        const { rows: users } = await pool.query(
          'SELECT id, name, email, avatar, status, created_at, updated_at FROM users WHERE id = $1',
          [decoded.userId]
        );

        const user = users[0] as UserWithoutPassword;
        
        if (!user) {
          console.log('Socket auth: User not found in database');
          return next(new Error('User not found'));
        }

        console.log('Socket auth: User authenticated:', user.name);
        socket.user = user;
        next();
          } catch (dbError: any) {
      console.log('Socket auth: Database error:', dbError.message);
      next(new Error('Authentication error'));
    }
    } catch (error) {
      console.log('Socket auth: JWT verification error:', error);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log('SocketManager: Raw connection received');
    console.log(`User connected: ${socket.user?.name} (${socket.user?.id})`);

    // Add user to connected users
    if (socket.user) {
      console.log('Adding user to connected users:', socket.user.id);
      connectedUsers.set(socket.user.id, {
        userId: socket.user.id,
        socketId: socket.id,
        user: socket.user
      });

      // Broadcast user online status
      socket.broadcast.emit('user:online', {
        userId: socket.user.id,
        user: socket.user
      });

      // Mark all received messages as delivered for this user
      console.log('About to call markAllMessagesAsDeliveredForUser for user:', socket.user.id);
      markAllMessagesAsDeliveredForUser(socket.user.id).catch(error => {
        console.error('Error in markAllMessagesAsDeliveredForUser:', error);
      });
    } else {
      console.log('No user found in socket connection');
    }

    // Join chat room
    socket.on('join_chat', async (data: { chatId: string }) => {
      socket.join(data.chatId);
      console.log(`User ${socket.user?.name} joined chat ${data.chatId}`);
      
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
      console.log(`User ${socket.user?.name} left chat ${data.chatId}`);
    });

    // Handle new message
    socket.on('new_message', async (data: { chatId: string; message: MessageWithSender }) => {
      try {
        // Broadcast message to all users in the chat
        socket.to(data.chatId).emit('new_message', data);

        // Update message delivery status
        await updateMessageDeliveryStatus(data.chatId, data.message.id);
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
        // Get chat ID for the message
        const { rows: messages } = await pool.query(
          'SELECT chat_id FROM messages WHERE id = $1',
          [data.messageId]
        );

        const message = messages[0];
        
        if (message) {
          // Update message read status
          await pool.query(
            'UPDATE messages SET is_read_by_recipient = true WHERE id = $1',
            [data.messageId]
          );

          // Broadcast read status
          socket.to(message.chat_id).emit('message:read', {
            chatId: message.chat_id,
            messageId: data.messageId
          });
        }
      } catch (error: any) {
        console.error('Error handling message read:', error);
      }
    });

    // Handle message delivered
    socket.on('message:delivered', async (data: { messageId: string; deliveredTo: string }) => {
      try {
        // Get chat ID for the message
        const { rows: messages } = await pool.query(
          'SELECT chat_id, deliveredTo FROM messages WHERE id = $1',
          [data.messageId]
        );

        const message = messages[0];
        
        if (message) {
          // Update delivery status
          const deliveredTo = message.deliveredTo ? message.deliveredTo : [];
          if (!deliveredTo.includes(data.deliveredTo)) {
            deliveredTo.push(data.deliveredTo);
            // Convert to proper JSON format for PostgreSQL
            const updatedDeliveredTo = JSON.stringify(deliveredTo);
            await pool.query(
              'UPDATE messages SET deliveredTo = $1 WHERE id = $2',
              [updatedDeliveredTo, data.messageId]
            );
          }

          // Broadcast delivery status
          socket.to(message.chat_id).emit('message:delivered', {
            chatId: message.chat_id,
            messageId: data.messageId,
            deliveredTo: data.deliveredTo
          });
        }
      } catch (error: any) {
        console.error('Error handling message delivered:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user?.name} (${socket.user?.id})`);

      if (socket.user) {
        // Remove user from connected users
        connectedUsers.delete(socket.user.id);

        // Broadcast user offline status
        socket.broadcast.emit('user:offline', {
          userId: socket.user.id
        });
      }
    });
  });
};

// Helper function to update message delivery status
const updateMessageDeliveryStatus = async (chatId: string, messageId: string): Promise<void> => {
  try {
    // Get all participants in the chat
    const { rows: participants } = await pool.query(
      'SELECT user_id FROM chat_participants WHERE chat_id = $1',
      [chatId]
    );

    const participantIds = participants.map(p => p.user_id);
    const onlineUserIds = Array.from(connectedUsers.keys());

    // Find online participants
    const onlineParticipants = participantIds.filter(id => onlineUserIds.includes(id));

    // Update delivery status
    if (onlineParticipants.length > 0) {
      // Convert to proper JSON format for PostgreSQL
      const deliveredTo = JSON.stringify(onlineParticipants);
      await pool.query(
        'UPDATE messages SET deliveredTo = $1 WHERE id = $2',
        [deliveredTo, messageId]
      );
    }
  } catch (error: any) {
    console.error('Error updating message delivery status:', error);
  }
};

// Helper function to update delivery status for a specific user when they join a chat
const updateDeliveryStatusForUser = async (chatId: string, userId: string): Promise<void> => {
  try {
    // Get all messages in the chat that haven't been delivered to this user
    const { rows: messages } = await pool.query(
      'SELECT id, deliveredTo FROM messages WHERE chat_id = $1 AND sender_id != $2',
      [chatId, userId]
    );

    for (const message of messages) {
      let deliveredTo = message.deliveredTo ? message.deliveredTo : [];
      
      // Check if user is not already in deliveredTo
      if (!deliveredTo.includes(userId)) {
        deliveredTo.push(userId);
        
        // Convert to proper JSON format for PostgreSQL
        const updatedDeliveredTo = JSON.stringify(deliveredTo);
        await pool.query(
          'UPDATE messages SET deliveredTo = $1 WHERE id = $2',
          [updatedDeliveredTo, message.id]
        );
        
        // Emit delivery event to notify other users
        globalIo.to(chatId).emit('message:delivered', {
          chatId: chatId,
          messageId: message.id,
          deliveredTo: userId
        });
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

// Helper function to mark all messages as delivered for a user when they log in
export const markAllMessagesAsDeliveredForUser = async (userId: string): Promise<void> => {
  console.log('Marking all messages as delivered for user:', userId);
  try {
    // Get all chats where the user is a participant
    const { rows: chats } = await pool.query(
      'SELECT chat_id FROM chat_participants WHERE user_id = $1',
      [userId]
    );
    console.log('Found chats for user:', chats.length, chats.map(c => c.chat_id));

    for (const chat of chats) {
      console.log('Processing chat:', chat.chat_id);
      // Get all messages in this chat that haven't been delivered to this user
      const { rows: messages } = await pool.query(
        'SELECT id, deliveredTo FROM messages WHERE chat_id = $1 AND sender_id != $2',
        [chat.chat_id, userId]
      );
      console.log('Found messages for chat:', chat.chat_id, messages.length);

      for (const message of messages) {
        let deliveredTo = message.deliveredTo ? message.deliveredTo : [];
        
        // Check if user is not already in deliveredTo
        if (!deliveredTo.includes(userId)) {
          console.log('Marking message as delivered:', message.id, 'for user:', userId);
          deliveredTo.push(userId);
          
          // Convert to proper JSON format for PostgreSQL
          const updatedDeliveredTo = JSON.stringify(deliveredTo);
          await pool.query(
            'UPDATE messages SET deliveredTo = $1 WHERE id = $2',
            [updatedDeliveredTo, message.id]
          );
          
          // Emit delivery event to notify other users
          globalIo.to(chat.chat_id).emit('message:delivered', {
            chatId: chat.chat_id,
            messageId: message.id,
            deliveredTo: userId
          });
          console.log('Emitted message:delivered event for message:', message.id);
        } else {
          console.log('Message already delivered to user:', message.id, userId);
        }
      }
    }
    console.log('Finished marking all messages as delivered for user:', userId);
  } catch (error: any) {
    console.error('Error marking all messages as delivered for user:', error);
  }
}; 
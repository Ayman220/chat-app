import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { MessageState, Message, ApiResponse, PaginatedResponse } from '../../types';
import api from '../../services/api';
import socketService from '../../services/socket';

const initialState: MessageState = {
  messages: {},
  loading: false,
  sending: false,
  error: null,
};

// Async thunks
export const fetchMessages = createAsyncThunk(
  'message/fetchMessages',
  async ({ chatId, page = 1, limit = 20 }: { chatId: string; page?: number; limit?: number }, { rejectWithValue }) => {
    try {
      const response = await api.get<ApiResponse<PaginatedResponse<Message>>>(`/chats/${chatId}/messages?page=${page}&limit=${limit}`);
      return {
        chatId,
        messages: response.data.data!.data,
        pagination: response.data.data!.pagination,
      };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch messages');
    }
  }
);

export const sendMessage = createAsyncThunk(
  'message/sendMessage',
  async ({ chatId, content }: { chatId: string; content: string }, { rejectWithValue }) => {
    try {
      const response = await api.post<ApiResponse<Message>>(`/chats/${chatId}/messages`, { content });
      const message = response.data.data!;

      // Emit message through socket for real-time updates
      const socket = socketService.getSocket();
      if (socket) {
        socket.emit('new_message', {
          chatId,
          message
        });
      }

      return {
        chatId,
        message,
      };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to send message');
    }
  }
);

export const markAllMessagesAsRead = createAsyncThunk(
  'message/markAllMessagesAsRead',
  async (chatId: string, { rejectWithValue }) => {
    try {
      await api.put<ApiResponse<void>>(`/chats/${chatId}/messages/read`);
      return chatId;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to mark messages as read');
    }
  }
);

const messageSlice = createSlice({
  name: 'message',
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<{ chatId: string; message: Message }>) => {
      const { chatId, message } = action.payload;
      if (!state.messages[chatId]) {
        state.messages[chatId] = [];
      }
      // Add new message to the end (newest messages should be at the end)
      state.messages[chatId].push(message);
    },
    updateMessage: (state, action: PayloadAction<{ chatId: string; messageId: string; updates: Partial<Message> }>) => {
      const { chatId, messageId, updates } = action.payload;
      console.log('🔄 REDUX updateMessage called:', { chatId, messageId, updates });

      if (state.messages[chatId]) {
        const messageIndex = state.messages[chatId].findIndex(msg => msg.id === messageId);
        console.log('🔄 Message found at index:', messageIndex);

        if (messageIndex !== -1) {
          const oldMessage = state.messages[chatId][messageIndex];
          console.log('🔄 Old message state:', { read: oldMessage.read, delivered: oldMessage.delivered });

          state.messages[chatId][messageIndex] = { ...state.messages[chatId][messageIndex], ...updates };

          const newMessage = state.messages[chatId][messageIndex];
          console.log('🔄 New message state:', { read: newMessage.read, delivered: newMessage.delivered });
        } else {
          console.log('🔄 Message not found in state');
        }
      } else {
        console.log('🔄 Chat not found in state');
      }
    },
    setMessageDelivered: (state, action: PayloadAction<{ chatId: string; messageId: string; userId: string }>) => {
      const { chatId, messageId, userId } = action.payload;
      if (state.messages[chatId]) {
        const messageIndex = state.messages[chatId].findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          const message = state.messages[chatId][messageIndex];
          message.delivered = true;
        }
      }
    },
    clearMessages: (state, action: PayloadAction<string>) => {
      const chatId = action.payload;
      delete state.messages[chatId];
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Messages
      .addCase(fetchMessages.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.loading = false;
        const { chatId, messages, pagination } = action.payload;
        if (!state.messages[chatId]) {
          state.messages[chatId] = [];
        }
        // If it's the first page, replace messages, otherwise prepend (for infinite scroll)
        if (pagination.page === 1) {
          // Messages come from database in descending order (newest first), 
          // so we need to reverse them to show oldest at top, newest at bottom
          state.messages[chatId] = [...messages].reverse();
        } else {
          // For infinite scroll, prepend older messages at the beginning
          // Messages come in descending order, so we need to reverse them for correct display
          state.messages[chatId] = [...messages].reverse().concat(state.messages[chatId]);
        }
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Send Message
      .addCase(sendMessage.pending, (state) => {
        state.sending = true;
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.sending = false;
        const { chatId, message } = action.payload;
        if (!state.messages[chatId]) {
          state.messages[chatId] = [];
        }
        // Add sent message to the end (newest messages should be at the end)
        state.messages[chatId].push(message);
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sending = false;
        state.error = action.payload as string;
      })
      // Mark Messages as Read
      .addCase(markAllMessagesAsRead.fulfilled, (state, action) => {
        const chatId = action.payload;
        if (state.messages[chatId]) {
          state.messages[chatId].forEach(message => {
            message.read = true;
          });
        }
      });
  },
});

export const { addMessage, updateMessage, setMessageDelivered, clearMessages, clearError } = messageSlice.actions;
export default messageSlice.reducer; 
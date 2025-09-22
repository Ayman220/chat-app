import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ChatState, Chat, ApiResponse, NewChatDetails } from '../../types';
import api from '../../services/api';

const initialState: ChatState = {
  chats: [],
  currentChat: null,
  loading: false,
  error: null,
};

// Async thunks
export const fetchChats = createAsyncThunk(
  'chat/fetchChats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<ApiResponse<Chat[]>>('/chats');
      return response.data.data!;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch chats');
    }
  }
);

export const createChat = createAsyncThunk(
  'chat/createChat',
  async ({ type, participants, name }: { type: 'private' | 'group'; participants: string[]; name?: string }, { rejectWithValue }) => {
    try {
      const response = await api.post<ApiResponse<Chat>>('/chats', { type, participants, name });
      return response.data.data!;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to create chat');
    }
  }
);

export const getChatById = createAsyncThunk(
  'chat/getChatById',
  async (chatId: string, { rejectWithValue }) => {
    try {
      const response = await api.get<ApiResponse<Chat>>(`/chats/${chatId}`);
      return response.data.data!;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch chat');
    }
  }
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setCurrentChat: (state, action: PayloadAction<Chat | null>) => {
      state.currentChat = action.payload;
    },
    addChat: (state, action: PayloadAction<Chat>) => {
      state.chats.unshift(action.payload);
    },
    updateChat: (state, action: PayloadAction<{ chatId: string; updates: Partial<Chat> }>) => {
      const { chatId, updates } = action.payload;
      const chatIndex = state.chats.findIndex(chat => chat.id === chatId);
      if (chatIndex !== -1) {
        state.chats[chatIndex] = { ...state.chats[chatIndex], ...updates };
      }
      if (state.currentChat?.id === chatId) {
        state.currentChat = { ...state.currentChat, ...updates };
      }
    },
    removeChat: (state, action: PayloadAction<string>) => {
      const chatId = action.payload;
      state.chats = state.chats.filter(chat => chat.id !== chatId);
      if (state.currentChat?.id === chatId) {
        state.currentChat = null;
      }
    },
    clearError: (state) => {
      state.error = null;
    },
    resetChatState: (state) => {
      state.chats = [];
      state.currentChat = null;
      state.loading = false;
      state.error = null;
    },
    newChatNotification: (state, action: PayloadAction<{ chatId: string; chatType: 'direct' | 'group'; chatDetails: NewChatDetails }>) => {
      const { chatId, chatType, chatDetails } = action.payload;

      // Convert NewChatDetails to Chat format
      const newChat: Chat = {
        id: chatDetails.id,
        name: chatDetails.name || undefined,
        type: chatType === 'direct' ? 'private' : 'group',
        participants: chatType === 'direct' && chatDetails.otherParticipant
          ? [chatDetails.otherParticipant]
          : [],
        other_participant: chatType === 'direct' ? chatDetails.otherParticipant : undefined,
        last_message: undefined,
        unread_count: 0,
        created_at: chatDetails.created_at,
        updated_at: chatDetails.updated_at,
      };

      // Check if chat already exists
      const existingChatIndex = state.chats.findIndex(chat => chat.id === chatId);
      if (existingChatIndex === -1) {
        // Add new chat to the beginning of the list
        state.chats.unshift(newChat);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Chats
      .addCase(fetchChats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchChats.fulfilled, (state, action) => {
        state.loading = false;
        state.chats = action.payload;
      })
      .addCase(fetchChats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Create Chat
      .addCase(createChat.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createChat.fulfilled, (state, action) => {
        state.loading = false;
        state.chats.unshift(action.payload);
        state.currentChat = action.payload;
      })
      .addCase(createChat.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Get Chat By ID
      .addCase(getChatById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getChatById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentChat = action.payload;
      })
      .addCase(getChatById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { setCurrentChat, addChat, updateChat, removeChat, clearError, resetChatState, newChatNotification } = chatSlice.actions;
export default chatSlice.reducer; 
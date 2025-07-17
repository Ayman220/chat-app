import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ChatState, Chat, ApiResponse, PaginatedResponse } from '../../types';
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
      return rejectWithValue(error.response?.data?.message || 'Failed to create chat');
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

export const { setCurrentChat, addChat, updateChat, removeChat, clearError } = chatSlice.actions;
export default chatSlice.reducer; 
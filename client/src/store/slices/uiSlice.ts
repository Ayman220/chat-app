import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UIState, User } from '../../types';

const initialState: UIState = {
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  onlineUsers: [],
  sidebarOpen: true,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
      localStorage.setItem('theme', action.payload);
    },
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', state.theme);
    },
    setOnlineUsers: (state, action: PayloadAction<User[]>) => {
      state.onlineUsers = action.payload;
    },
    addOnlineUser: (state, action: PayloadAction<User>) => {
      const existingUserIndex = state.onlineUsers.findIndex(user => user.id === action.payload.id);
      if (existingUserIndex === -1) {
        state.onlineUsers.push(action.payload);
      } else {
        state.onlineUsers[existingUserIndex] = action.payload;
      }
    },
    removeOnlineUser: (state, action: PayloadAction<string>) => {
      state.onlineUsers = state.onlineUsers.filter(user => user.id !== action.payload);
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
  },
});

export const {
  setTheme,
  toggleTheme,
  setOnlineUsers,
  addOnlineUser,
  removeOnlineUser,
  setSidebarOpen,
  toggleSidebar,
} = uiSlice.actions;

export default uiSlice.reducer; 
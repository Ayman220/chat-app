import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UIState, User } from '../../types';

const initialState: UIState = {
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  onlineUsers: [],
  sidebarOpen: true,
  lastSeen: JSON.parse(localStorage.getItem('lastSeen') || '{}'),
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
      // Remove last seen data for users who are currently online
      action.payload.forEach(user => {
        delete state.lastSeen[user.id];
      });
      localStorage.setItem('lastSeen', JSON.stringify(state.lastSeen));
    },
    addOnlineUser: (state, action: PayloadAction<User>) => {
      const existingUserIndex = state.onlineUsers.findIndex(user => user.id === action.payload.id);
      if (existingUserIndex === -1) {
        state.onlineUsers.push(action.payload);
      } else {
        state.onlineUsers[existingUserIndex] = action.payload;
      }
      // Remove last seen data when user comes back online
      delete state.lastSeen[action.payload.id];
      localStorage.setItem('lastSeen', JSON.stringify(state.lastSeen));
    },
    removeOnlineUser: (state, action: PayloadAction<string>) => {
      state.onlineUsers = state.onlineUsers.filter(user => user.id !== action.payload);
    },
    setLastSeen: (state, action: PayloadAction<{ userId: string; lastSeen: string }>) => {
      state.lastSeen[action.payload.userId] = action.payload.lastSeen;
      localStorage.setItem('lastSeen', JSON.stringify(state.lastSeen));
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    resetUIState: (state) => {
      // Keep theme and sidebar state, but reset user-related data
      state.onlineUsers = [];
      state.lastSeen = {};
      localStorage.removeItem('lastSeen');
    },
  },
});

export const {
  setTheme,
  toggleTheme,
  setOnlineUsers,
  addOnlineUser,
  removeOnlineUser,
  setLastSeen,
  setSidebarOpen,
  toggleSidebar,
  resetUIState,
} = uiSlice.actions;

export default uiSlice.reducer; 
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AuthState, User, LoginFormData, RegisterFormData, ApiResponse } from '../../types';
import api from '../../services/api';
import socketService from '../../services/socket';
import fcmService from '../../services/fcm';

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  loading: false,
  initialLoading: !!localStorage.getItem('token'), // Only show initial loading if there's a token to verify
  error: null,
};

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: LoginFormData, { rejectWithValue }) => {
    try {
      const response = await api.post<ApiResponse<{ user: User; token: string }>>('/auth/login', credentials);
      const { user, token } = response.data.data!;
      localStorage.setItem('token', token);

      // Connect to socket immediately after successful login
      try {
        const socket = socketService.connect(token);
      } catch (error) {
        console.error('Auth: Socket connection failed:', error);
      }

      return { user, token };
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Login failed';
      return rejectWithValue(errorMessage);
    }
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (userData: RegisterFormData, { rejectWithValue }) => {
    try {
      const response = await api.post<ApiResponse<{ user: User; token: string }>>('/auth/register', userData);
      const { user, token } = response.data.data!;
      localStorage.setItem('token', token);
      return { user, token };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Registration failed');
    }
  }
);

export const verifyToken = createAsyncThunk(
  'auth/verifyToken',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }
      const response = await api.get<ApiResponse<User>>('/auth/me');
      const user = response.data.data!;

      // Connect to socket after successful token verification
      try {
        const socket = socketService.connect(token);
      } catch (error) {
        console.error('Auth: Socket connection failed on token verification:', error);
      }

      return user;
    } catch (error: any) {
      localStorage.removeItem('token');
      return rejectWithValue('Token verification failed');
    }
  }
);

export const forgotPassword = createAsyncThunk(
  'auth/forgotPassword',
  async (email: string, { rejectWithValue }) => {
    try {
      await api.post<ApiResponse<void>>('/auth/forgot-password', { email });
      return 'Password reset email sent';
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to send reset email');
    }
  }
);

export const resetPassword = createAsyncThunk(
  'auth/resetPassword',
  async ({ token, password }: { token: string; password: string }, { rejectWithValue }) => {
    try {
      await api.post<ApiResponse<void>>('/auth/reset-password', { token, password });
      return 'Password reset successful';
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Password reset failed');
    }
  }
);

export const initializeFCM = createAsyncThunk(
  'auth/initializeFCM',
  async (_, { rejectWithValue }) => {
    try {
      const success = await fcmService.initialize();
      if (success) {
        return 'FCM initialized successfully';
      } else {
        return rejectWithValue('Failed to initialize FCM');
      }
    } catch (error: any) {
      return rejectWithValue(error.message || 'FCM initialization failed');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      localStorage.removeItem('token');

      // Disconnect socket on logout
      socketService.disconnect();
    },
    clearAllState: (state) => {
      // Reset auth state
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.initialLoading = false;
      state.error = null;

      // Clear localStorage
      localStorage.removeItem('token');
      localStorage.removeItem('lastSeenData');

      // Disconnect socket
      socketService.disconnect();
    },
    clearError: (state) => {
      state.error = null;
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Register
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Verify Token
      .addCase(verifyToken.pending, (state) => {
        state.initialLoading = true;
      })
      .addCase(verifyToken.fulfilled, (state, action) => {
        state.initialLoading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(verifyToken.rejected, (state) => {
        state.initialLoading = false;
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
      })
      // Forgot Password
      .addCase(forgotPassword.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(forgotPassword.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(forgotPassword.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Reset Password
      .addCase(resetPassword.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(resetPassword.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(resetPassword.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Initialize FCM
      .addCase(initializeFCM.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(initializeFCM.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(initializeFCM.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { logout, clearAllState, clearError, setUser } = authSlice.actions;
export default authSlice.reducer; 
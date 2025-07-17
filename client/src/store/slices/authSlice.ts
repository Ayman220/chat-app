import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AuthState, User, LoginFormData, RegisterFormData, ApiResponse } from '../../types';
import api from '../../services/api';
import socketService from '../../services/socket';

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  loading: false,
  error: null,
};

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: LoginFormData, { rejectWithValue }) => {
    console.log('Auth: Login function called');
    try {
      const response = await api.post<ApiResponse<{ user: User; token: string }>>('/auth/login', credentials);
      const { user, token } = response.data.data!;
      console.log('Auth: Login successful for user:', user.name);
      localStorage.setItem('token', token);
      
      // Connect to socket immediately after successful login
      console.log('Auth: Connecting to socket after login...');
      try {
        const socket = socketService.connect(token);
        console.log('Auth: Socket connection result:', !!socket);
      } catch (error) {
        console.error('Auth: Socket connection failed:', error);
      }
      
      return { user, token };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Login failed';
      // Show toast here to avoid duplicate toasts
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(errorMessage);
      });
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
      return response.data.data!;
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
        state.loading = true;
      })
      .addCase(verifyToken.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(verifyToken.rejected, (state) => {
        state.loading = false;
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
      });
  },
});

export const { logout, clearError, setUser } = authSlice.actions;
export default authSlice.reducer; 
// User types
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  status?: string;
  created_at: string;
  updated_at: string;
}

// Chat types
export interface Chat {
  id: string;
  name?: string;
  type: 'private' | 'group';
  participants: User[];
  other_participant?: User;
  last_message?: Message;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

// Message types
export interface Message {
  id: string;
  content: string;
  sender_id: string;
  sender?: User;
  chat_id: string;
  is_read: boolean;
  is_read_by_recipient?: boolean;
  deliveredTo?: string[];
  created_at: string;
  updated_at: string;
}

// Auth state types
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

// Chat state types
export interface ChatState {
  chats: Chat[];
  currentChat: Chat | null;
  loading: boolean;
  error: string | null;
}

// Message state types
export interface MessageState {
  messages: { [chatId: string]: Message[] };
  loading: boolean;
  sending: boolean;
  error: string | null;
}

// UI state types
export interface UIState {
  theme: 'light' | 'dark';
  onlineUsers: User[];
  sidebarOpen: boolean;
}

// Root state type
export interface RootState {
  auth: AuthState;
  chat: ChatState;
  message: MessageState;
  ui: UIState;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Socket event types
export interface SocketEvents {
  'new_message': {
    chatId: string;
    message: Message;
  };
  'typing_start': {
    chatId: string;
    userId: string;
  };
  'typing_stop': {
    chatId: string;
    userId: string;
  };
  'user:online': {
    userId: string;
    user: User;
  };
  'user:offline': {
    userId: string;
  };
  'message:read': {
    chatId: string;
    messageId: string;
  };
  'message:delivered': {
    chatId: string;
    messageId: string;
    deliveredTo: string;
  };
}

// Form types
export interface LoginFormData {
  email: string;
  password: string;
}

export interface RegisterFormData {
  name: string;
  email: string;
  password: string;
}

export interface ResetPasswordFormData {
  token: string;
  password: string;
}

// Component prop types
export interface ProtectedRouteProps {
  children: React.ReactNode;
}

export interface PublicRouteProps {
  children: React.ReactNode;
}

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export interface NewChatModalProps {
  onClose: () => void;
} 
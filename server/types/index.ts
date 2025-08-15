import { Request } from 'express';
import { Socket } from 'socket.io';

// User types
export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  avatar?: string;
  status?: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserWithoutPassword extends Omit<User, 'password'> { }

// Chat types
export interface Chat {
  id: string;
  name?: string;
  type: 'private' | 'group';
  created_at: Date;
  updated_at: Date;
}

export interface ChatParticipant {
  id: string;
  chat_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: Date;
}

export interface ChatWithParticipants extends Chat {
  participants: ChatParticipant[];
}

// Message types
export interface Message {
  id: string;
  content: string;
  sender_id: string;
  chat_id: string;
  read: boolean;
  delivered: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MessageWithSender extends Message {
  sender: UserWithoutPassword;
}

// Auth types
export interface AuthRequest extends Request {
  user?: UserWithoutPassword;
}

export interface JWTPayload {
  userId: string;
  email: string;
}

// Socket types
export interface AuthenticatedSocket extends Socket {
  user?: UserWithoutPassword;
}

export interface SocketEvents {
  'join_chat': { chatId: string };
  'leave_chat': { chatId: string };
  'new_message': { chatId: string; message: MessageWithSender };
  'typing_start': { chatId: string; userId: string };
  'typing_stop': { chatId: string; userId: string };
  'user:online': { userId: string; user: UserWithoutPassword };
  'user:offline': { userId: string };
  'message:read': { chatId: string; messageId: string };
  'message:delivered': { chatId: string; messageId: string; delivered: string };
}

// API Response types
export interface ApiResponse<T = any> {
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

// Database types
export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

// Email types
export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailTemplate {
  to: string;
  subject: string;
  html: string;
}

// Validation types
export interface ValidationError {
  field: string;
  message: string;
}

// File upload types
export interface FileUploadConfig {
  destination: string;
  filename: string;
  limits: {
    fileSize: number;
    files: number;
  };
  fileFilter: (req: Request, file: Express.Multer.File, cb: any) => void;
}

// Environment variables
export interface Environment {
  NODE_ENV: string;
  PORT: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  EMAIL_HOST: string;
  EMAIL_PORT: number;
  EMAIL_USER: string;
  EMAIL_PASS: string;
  CLIENT_URL: string;
} 
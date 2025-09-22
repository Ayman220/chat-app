import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
  }

  connect(token: string): Socket {

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(this.baseURL, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
    });

    this.socket.on('connect_error', (error) => {
      console.error('SocketService: Connection error:', error);
    });

    this.socket.on('error', (error) => {
      console.error('SocketService: Socket error:', error);
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  emit<T extends keyof SocketEvents>(event: T, data: SocketEvents[T]): void {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  on<T extends keyof SocketEvents>(event: T, callback: (data: SocketEvents[T]) => void): void {
    if (this.socket) {
      this.socket.on(event as string, callback as any);
    }
  }

  off<T extends keyof SocketEvents>(event: T, callback?: (data: SocketEvents[T]) => void): void {
    if (this.socket) {
      if (callback) {
        this.socket.off(event as string, callback as any);
      } else {
        this.socket.off(event as string);
      }
    }
  }
}

const socketService = new SocketService();
export default socketService; 
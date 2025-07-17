import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
    console.log('SocketService: Constructor - baseURL =', this.baseURL);
    console.log('SocketService: Constructor - REACT_APP_SOCKET_URL =', process.env.REACT_APP_SOCKET_URL);
    console.log('SocketService: Constructor - REACT_APP_API_URL =', process.env.REACT_APP_API_URL);
  }

  connect(token: string): Socket {
    console.log('SocketService: connect() called with token:', !!token);
    
    if (this.socket) {
      console.log('SocketService: Disconnecting existing socket...');
      this.socket.disconnect();
    }

    console.log('SocketService: Connecting to socket at:', this.baseURL);
    
    this.socket = io(this.baseURL, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect_error', (error) => {
      console.error('SocketService: Connection error:', error);
    });

    this.socket.on('connect', () => {
      console.log('SocketService: Socket connected to:', this.baseURL);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('SocketService: Socket disconnected:', reason);
    });

    console.log('SocketService: Socket created:', !!this.socket);
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
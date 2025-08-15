# Real-Time Chat Application

A modern, feature-rich real-time chat application built with Node.js, React, and Socket.IO. This application provides WhatsApp-like functionality with a unique, sleek design.

## Features

### 🔐 Authentication & User Management
- User registration and login with JWT tokens
- Password encryption using bcrypt
- Password reset via email
- User profile management with avatar upload

### 💬 Messaging
- Real-time private messaging
- Group chat functionality with member management
- Support for text, images, videos, and documents
- Message history with pagination
- Typing indicators
- Message delivery status

### 📱 Real-Time Features
- Live notifications for new messages
- Online/offline status indicators
- Real-time message delivery
- Desktop notifications

### 🔍 Search & Discovery
- Search messages within chats
- Search users and groups
- Contact list management

### 🎨 Modern UI/UX
- Responsive design for web and mobile
- Dark/Light theme support
- Modern, sleek interface
- Smooth animations and transitions

## Tech Stack

### Backend
- **Node.js** with Express framework
- **PostgreSQL** for data persistence
- **Socket.IO** for real-time communication
- **JWT** for authentication
- **Multer** for file uploads
- **Nodemailer** for email notifications

### Frontend
- **React** with functional components and hooks
- **Redux Toolkit** for state management
- **Socket.IO Client** for real-time features
- **Tailwind CSS** for styling
- **Axios** for API calls

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chat-app
   ```

2. **Install dependencies**
   ```bash
   npm run install-all
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   
   # Database
   DATABASE_URL=postgresql://username:password@localhost:5432/chat_app
   
   # JWT
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRES_IN=7d
   
   # Email (for password reset)
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   
   # File Upload
   UPLOAD_PATH=./uploads
   MAX_FILE_SIZE=10485760
   ```

4. **Database Setup**
   ```bash
   npm run setup-db
   ```

5. **Start Development Servers**
   ```bash
   npm run dev
   ```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## API Documentation

### Authentication Endpoints

#### POST /api/auth/register
Register a new user
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword"
}
```

#### POST /api/auth/login
Login user
```json
{
  "email": "john@example.com",
  "password": "securepassword"
}
```

#### POST /api/auth/forgot-password
Request password reset
```json
{
  "email": "john@example.com"
}
```

### User Endpoints

#### GET /api/users/profile
Get current user profile

#### PUT /api/users/profile
Update user profile
```json
{
  "name": "John Doe",
  "status": "Available"
}
```

#### POST /api/users/avatar
Upload profile picture

### Chat Endpoints

#### GET /api/chats
Get user's chat list

#### POST /api/chats
Create new private chat
```json
{
  "participantId": "user-id"
}
```

#### GET /api/chats/:chatId/messages
Get chat messages with pagination
```
?page=1&limit=50
```

#### POST /api/chats/:chatId/messages
Send message
```json
{
  "content": "Hello!",
  "type": "text"
}
```

### Group Endpoints

#### POST /api/groups
Create new group
```json
{
  "name": "Project Team",
  "participants": ["user-id-1", "user-id-2"]
}
```

#### PUT /api/groups/:groupId/participants
Add/remove group participants

## Database Schema

### Users Table
- id (UUID, Primary Key)
- name (VARCHAR)
- email (VARCHAR, Unique)
- password_hash (VARCHAR)
- avatar_url (VARCHAR)
- status (VARCHAR)
- last_seen (TIMESTAMP)
- created_at (TIMESTAMP)

### Chats Table
- id (UUID, Primary Key)
- type (ENUM: 'private', 'group')
- name (VARCHAR, for groups)
- created_at (TIMESTAMP)

### Chat_Participants Table
- chat_id (UUID, Foreign Key)
- user_id (UUID, Foreign Key)
- role (ENUM: 'admin', 'member')
- joined_at (TIMESTAMP)

### Messages Table
- id (UUID, Primary Key)
- chat_id (UUID, Foreign Key)
- sender_id (UUID, Foreign Key)
- content (TEXT)
- type (ENUM: 'text', 'image', 'video', 'document')
- media_url (VARCHAR)
- read (BOOLEAN)
- created_at (TIMESTAMP)

## Security Features

- JWT token authentication
- Password encryption with bcrypt
- Input validation and sanitization
- Rate limiting
- CORS protection
- Helmet.js for security headers
- SQL injection prevention

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details 
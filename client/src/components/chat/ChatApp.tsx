import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchChats, getChatById, newChatNotification } from '../../store/slices/chatSlice';
import { addOnlineUser, removeOnlineUser, setOnlineUsers, setLastSeen } from '../../store/slices/uiSlice';
import { fetchLastSeenData } from '../../services/api';
import socketService from '../../services/socket';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import Header from './Header';
import LoadingSpinner from '../common/LoadingSpinner';
import { RootState, AppDispatch } from '../../store';
import { showToast } from '../common/CustomToast';

const ChatApp: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { chats, currentChat, loading } = useSelector((state: RootState) => state.chat);
  const { chatId } = useParams<{ chatId?: string }>();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Listen for online/offline events
  useEffect(() => {
    const socket = socketService.getSocket();

    if (socket) {
      // Listen for online/offline events
      socket.on('user:online', (data: any) => {
        dispatch(addOnlineUser(data.user));
      });

      socket.on('user:offline', (data: any) => {
        dispatch(removeOnlineUser(data.userId));
        if (data.lastSeen) {
          dispatch(setLastSeen({ userId: data.userId, lastSeen: data.lastSeen }));
        }
      });

      socket.on('users:online', (data: any) => {
        dispatch(setOnlineUsers(data));
      });

      // Listen for new chat notifications
      socket.on('new_chat_notification', (data: any) => {
        dispatch(newChatNotification(data));

        // Show toast notification
        const chatName = data.chatType === 'direct'
          ? data.chatDetails.otherParticipant?.name || 'Unknown User'
          : data.chatDetails.name || 'New Group';

        showToast({
          message: `New chat: ${chatName}`,
          onClick: () => navigate(`/chat/${data.chatId}`),
          duration: 4000,
          type: 'success'
        });
      });
    } else {
      const token = localStorage.getItem('token');
      if (token) {
        socketService.connect(token);
      }
    }
  }, [dispatch, navigate]);

  // Fetch chats on mount
  useEffect(() => {
    dispatch(fetchChats());
  }, [dispatch]);

  // Fetch last seen data for all users in chats
  useEffect(() => {
    const fetchLastSeenForChats = async () => {
      if (chats.length === 0) return;

      try {
        // Collect all user IDs from chats
        const userIds = new Set<string>();
        chats.forEach(chat => {
          if (chat.type === 'private' && chat.other_participant?.id) {
            userIds.add(chat.other_participant.id);
          }
          // For group chats, we could add all participants here if needed
        });

        if (userIds.size > 0) {
          const lastSeenData = await fetchLastSeenData(Array.from(userIds));

          // Update Redux state with fetched last seen data
          Object.entries(lastSeenData).forEach(([userId, lastSeen]) => {
            dispatch(setLastSeen({ userId, lastSeen: lastSeen as string }));
          });
        }
      } catch (error) {
        console.error('Error fetching last seen data:', error);
      }
    };

    fetchLastSeenForChats();
  }, [chats, dispatch]);

  // Handle chat selection from URL
  useEffect(() => {
    if (chatId && chats.length > 0) {
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        dispatch(getChatById(chatId));
      } else {
        // Chat not found, redirect to home
        navigate('/');
      }
    }
  }, [chatId, chats, dispatch, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex flex-col h-screen bg-chat-bg">
      {/* Header - spans full width */}
      <Header onMenuClick={toggleSidebar} showMenuButton={false} />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'block' : 'hidden'} md:block md:w-80 lg:w-96 flex-shrink-0`}>
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col">
          <ChatWindow />
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default ChatApp; 
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchChats, getChatById } from '../../store/slices/chatSlice';
import { addOnlineUser, removeOnlineUser } from '../../store/slices/uiSlice';
import socketService from '../../services/socket';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import Header from './Header';
import LoadingSpinner from '../common/LoadingSpinner';
import { RootState, AppDispatch } from '../../store';

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
      });
    } else {
      const token = localStorage.getItem('token');
      if (token) {
        socketService.connect(token);
      }
    }
  }, [dispatch]);

  // Fetch chats on mount
  useEffect(() => {
    dispatch(fetchChats());
  }, [dispatch]);

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
      <Header onMenuClick={toggleSidebar} showMenuButton={!sidebarOpen} />
      
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
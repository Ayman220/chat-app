import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMessages, sendMessage, markAllMessagesAsRead, setMessageDelivered, updateMessage } from '../../store/slices/messageSlice';
import { addMessage } from '../../store/slices/messageSlice';
import socketService from '../../services/socket';
import LoadingSpinner from '../common/LoadingSpinner';
import { IoCheckmarkDone, IoCheckmark, IoSend, IoAttach } from 'react-icons/io5';
import { RootState, AppDispatch } from '../../store';

const ChatWindow: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { currentChat } = useSelector((state: RootState) => state.chat);
  const { user } = useSelector((state: RootState) => state.auth);
  const onlineUsers = useSelector((state: RootState) => state.ui.onlineUsers);
  const { messages, loading, sending } = useSelector((state: RootState) => state.message);
  const [input, setInput] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const prevMessagesLength = useRef<number>(0);
  const prevFirstMsgId = useRef<{ id: string | null; chatId: string | null; lastMsgId: string | null } | null>(null);

  // Move chatMessages declaration here so it's available for all hooks and logic
  const chatMessages = messages[currentChat?.id || ''] || [];

  const PAGE_SIZE = 10;

  // Fetch messages when chat changes
  useEffect(() => {
    if (currentChat) {
      setPage(1);
      setHasMore(true);
      dispatch(fetchMessages({ chatId: currentChat.id, page: 1, limit: PAGE_SIZE }));
      dispatch(markAllMessagesAsRead(currentChat.id));
    }
  }, [currentChat, dispatch]);

  // Scroll to bottom after initial load (only once per chat)
  const lastScrolledChatId = useRef<string | null>(null);
  useEffect(() => {
    if (!loading && page === 1 && currentChat?.id && lastScrolledChatId.current !== currentChat.id) {
      if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      lastScrolledChatId.current = currentChat.id;
    }
    // Reset when chat changes
    if (currentChat?.id && lastScrolledChatId.current !== currentChat.id) {
      lastScrolledChatId.current = null;
    }
  }, [loading, page, currentChat]);

  // Infinite scroll up handler (hasMore only controls loading more, not initial scroll)
  const handleScroll = async () => {
    const container = messagesContainerRef.current;
    if (!container || loading || !hasMore) return;

    // Load more messages when scrolling to top
    if (container.scrollTop === 0) {
      setIsLoadingMore(true);
      // Load previous page
      const nextPage = page + 1;
      const result = await dispatch(fetchMessages({ chatId: currentChat!.id, page: nextPage, limit: PAGE_SIZE }));
      const payload = result.payload as any;
      if (payload && payload.messages && payload.messages.length > 0) {
        setPage(nextPage);
        setTimeout(() => {
          if (container && container.children.length > 0) {
            const firstMsg = container.children[1];
            if (firstMsg) firstMsg.scrollIntoView();
          }
        }, 0);
        // Stop if no more pages
        if (payload.pagination && !payload.pagination.hasNext) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
      setIsLoadingMore(false);
    }
  };

  // Join/leave chat room for real-time updates
  useEffect(() => {
    const socket = socketService.getSocket();
    if (socket && currentChat) {
      socket.emit('join_chat', { chatId: currentChat.id });
      return () => {
        socket.emit('leave_chat', { chatId: currentChat.id });
      };
    }
  }, [currentChat]);

  // Monitor specific message updates for debugging
  useEffect(() => {
    const updatedMessages = chatMessages.filter(msg => msg.read === true);
    if (updatedMessages.length > 0) {
      console.log('📊 ChatWindow: Found read messages:', updatedMessages.map(msg => ({ id: msg.id, read: msg.read, delivered: msg.delivered })));
    }
  }, [chatMessages]);

  // Monitor chatMessages changes for debugging
  useEffect(() => {

    console.log('📊 ChatWindow: chatMessages updated:', {
      chatId: currentChat?.id,
      messageCount: chatMessages.length,
      messages: chatMessages.map(msg => ({ id: msg.id, read: msg.read, delivered: msg.delivered }))
    });
  }, [chatMessages, currentChat?.id]);

  // Scroll to bottom when messages change, unless loading more
  useEffect(() => {
    const currentLength = chatMessages.length;
    const firstMsgId = chatMessages[0]?.id;
    // If chat changed, scroll to bottom
    if (prevFirstMsgId.current === null || currentChat?.id !== prevFirstMsgId.current?.chatId) {
      if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });

      // Don't automatically mark as read - let user action trigger it
    } else if (currentLength > prevMessagesLength.current) {
      // If a new message is added at the end, scroll to bottom
      const lastMsgId = chatMessages[chatMessages.length - 1]?.id;
      if (lastMsgId !== prevFirstMsgId.current?.lastMsgId) {
        if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevMessagesLength.current = currentLength;
    prevFirstMsgId.current = { id: firstMsgId, chatId: currentChat?.id || null, lastMsgId: chatMessages[chatMessages.length - 1]?.id || null };
  }, [chatMessages, currentChat]);

  // Listen for real-time new messages
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !currentChat) return;
    const handler = (data: any) => {
      try {
        // Only add if not sent by this user
        if (
          data.chatId === currentChat.id &&
          (data.message.sender_id !== user?.id && data.message.sender?.id !== user?.id)
        ) {
          dispatch(addMessage({ chatId: currentChat.id, message: data.message }));

          // Mark messages as read when receiving new messages (user is actively viewing the chat)
          dispatch(markAllMessagesAsRead(currentChat.id));
        }
      } catch (error) {
        console.error('Error handling new_message event:', error);
      }
    };
    socket.on('new_message', handler);
    return () => { socket.off('new_message', handler); };
  }, [currentChat, dispatch, user?.id]);



  // Listen for message:read events
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !currentChat) return;
    const handler = (data: any) => {
      try {
        console.log('📖 CLIENT RECEIVED READ EVENT:', data);
        console.log('📖 Current chat ID:', currentChat.id);
        console.log('📖 Event chat ID:', data.chatId);
        console.log('📖 Chat messages before update:', chatMessages.length);
        console.log('📖 Available message IDs in state:', chatMessages.map(msg => msg.id));
        console.log('📖 Current user ID:', user?.id);
        console.log('📖 Event user ID:', data.userId);

        if (data.chatId === currentChat.id) {
          console.log('📖 MATCHING CHAT - Updating message:', data.messageId);

          // Check if the message exists in the current state
          const messageExists = chatMessages.some(msg => msg.id === data.messageId);
          console.log('📖 Message exists in state:', messageExists);

          if (messageExists) {
            // Only update if this is a message sent by the current user (for read receipts)
            const messageToUpdate = chatMessages.find(msg => msg.id === data.messageId);
            if (messageToUpdate && messageToUpdate.sender_id === user?.id) {
              console.log('📖 UPDATING OWN MESSAGE - Dispatching updateMessage');
              dispatch(updateMessage({
                chatId: data.chatId,
                messageId: data.messageId,
                updates: { read: true }
              }));
            } else {
              console.log('📖 NOT UPDATING - Message not sent by current user or not found');
            }

            console.log('📖 Update dispatched - checking state in next render');
          } else {
            console.log('📖 WARNING: Message not found in current state');
          }
        } else {
          console.log('📖 CHAT ID MISMATCH - Not updating');
        }
      } catch (error) {
        console.error('Error handling message:read event:', error);
      }
    };
    socket.on('message:read', handler);
    return () => { socket.off('message:read', handler); };
  }, [currentChat, dispatch, chatMessages, user?.id]);

  // Listen for message:delivered events
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !currentChat) return;
    const handler = (data: any) => {
      try {
        if (data.chatId === currentChat.id) {
          dispatch(setMessageDelivered({ chatId: data.chatId, messageId: data.messageId, userId: data.delivered }));
        }
      } catch (error) {
        console.error('Error handling message:delivered event:', error);
      }
    };
    socket.on('message:delivered', handler);
    return () => { socket.off('message:delivered', handler); };
  }, [currentChat, dispatch]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentChat) return;

    await dispatch(sendMessage({ chatId: currentChat.id, content: input }));
    setInput('');

    // Return focus to input if not on mobile
    if (!isMobile()) {
      const inputElement = document.querySelector('input[placeholder="Write a message"]') as HTMLInputElement;
      if (inputElement) {
        inputElement.focus();
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as any);
    }
  };

  // Helper function to detect mobile devices
  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  if (!currentChat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-8 rounded-2xl shadow-sm max-w-md">
          <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Welcome to ChatApp</h3>
          <p className="text-gray-500 mb-6">Select a chat from the sidebar to start messaging</p>
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-400">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span>Ready to chat</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">

      {/* Messages Area */}
      <div
        className="flex-1 p-4 overflow-y-auto min-h-0 bg-white mx-4 my-4 rounded-2xl shadow-sm"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        <div className="space-y-4">
          {loading && page === 1 && !isLoadingMore ? (
            <div className="text-center text-gray-500 flex justify-center items-center h-32">
              <LoadingSpinner size="md" />
              <span className="ml-2">Loading messages...</span>
            </div>
          ) : chatMessages.length === 0 ? (
            <div className="text-center text-gray-500">
              <p>No messages yet</p>
              <p className="text-sm">Start the conversation!</p>
            </div>
          ) : (
            <>
              {isLoadingMore && (
                <div className="w-full px-4 py-2 mb-1 text-gray-900 mr-auto flex items-center justify-center">
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Loading messages...</span>
                </div>
              )}
              {chatMessages.map((msg) => {
                const isOwnMessage = msg.sender_id === user?.id || msg.sender?.id === user?.id;
                const senderName = isOwnMessage
                  ? user?.name || 'You'
                  : (currentChat.type === 'private'
                    ? currentChat.other_participant?.name
                    : msg.sender?.name) || 'Unknown User';
                const senderInitials = senderName.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2);

                // WhatsApp-style ticks logic
                let statusIcon = null;
                const recipientId = currentChat.type === 'private' ? currentChat.other_participant?.id : null;
                if (isOwnMessage) {
                  if (currentChat.type === 'private' && msg.read) {
                    // Double green tick (read by recipient)
                    statusIcon = (
                      <IoCheckmarkDone className="text-green-500" size={16} />
                    );
                  } else if (recipientId && msg.delivered) {
                    // Double blue tick (delivered)
                    statusIcon = (
                      <IoCheckmarkDone className="text-blue-300" size={16} />
                    );
                  } else {
                    // Single grey tick (sent)
                    statusIcon = (
                      <IoCheckmark className="text-blue-200" size={16} />
                    );
                  }
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start space-x-2 ${isOwnMessage ? 'flex-row-reverse space-x-reverse' : ''}`}
                  >
                    {/* Avatar */}
                    <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-600 font-semibold text-sm">
                        {senderInitials}
                      </span>
                    </div>

                    <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} gap-1`}>
                      {/* Message Bubble */}
                      <div className={`max-w-lg px-4 py-2 rounded-lg shadow-sm ${isOwnMessage
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-blue-500 border border-blue-500'
                        }`}>
                        <div className="text-sm">
                          {msg.content}
                        </div>
                      </div>

                      {/* Message Time and Status */}
                      <div className={`flex flex-row-reverse items-end space-x-1 px-2 text-xs gap-2 text-black-400`}>
                        <span>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </span>
                        {statusIcon && (
                          <span className="flex items-center">
                            {statusIcon}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Message Input */}
      <div className="p-4 bg-white border-t border-gray-200 flex-shrink-0">
        <div className="flex items-center space-x-3">

          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Write a message"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={sending}
              className="w-full px-4 py-3 pr-20 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
              <button
                className="p-1 text-gray-500 rounded-md transition-colors"
                title="Attach file"
              >
                <IoAttach size={28} className='text-blue-500' />
              </button>
              <button
                className="p-2 bg-blue-500 cursor-pointer text-white rounded-md hover:bg-blue-600 transition-colors"
                onClick={handleSend}
                disabled={sending || !input.trim()}
                title="Send message"
              >
                <IoSend size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow; 
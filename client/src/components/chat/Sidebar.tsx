import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Plus, Search } from 'lucide-react';
import { MdPlayArrow } from "react-icons/md";
import NewChatModal from './NewChatModal';
import { useNavigate, useParams } from 'react-router-dom';
import { RootState } from '../../store';

interface SidebarProps {
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const { chats } = useSelector((state: RootState) => state.chat);
  const { user } = useSelector((state: RootState) => state.auth);
  const onlineUsers = useSelector((state: RootState) => state.ui.onlineUsers);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const navigate = useNavigate();
  const { chatId } = useParams<{ chatId?: string }>();

  const filteredChats = chats.filter(chat => {
    const searchTerm = searchQuery.toLowerCase();
    const chatName = chat.type === 'private' 
      ? chat.other_participant?.name || 'Unknown User'
      : chat.name || 'Group';
    return chatName.toLowerCase().includes(searchTerm);
  });

  return (
    <div className="md:w-75 lg:w-90 bg-chat-sidebar border border-gray-200 mx-2 mt-2 flex flex-col min-h-0 shadow-sm" style={{ borderRadius: '1.5rem' }}>
      {/* Messages Header */}
      <div className="px-4 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
      </div>

      {/* Search Bar and New Chat Button */}
      <div className="px-4 pb-4">
        <div className="flex items-center space-x-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search chat"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-1"
            onClick={() => setShowModal(true)}
          >
            <span className="text-sm font-medium">CHAT</span>
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto py-3 min-h-0">
        {filteredChats.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <p>No chats found</p>
            <p className="text-sm">Start a conversation to see it here</p>
          </div>
        ) : (
          <div className="px-2">
            {filteredChats.map((chat) => {
              const isPrivate = chat.type === 'private';
              const otherUserId = isPrivate ? chat.other_participant?.id : null;
              const isOnline = isPrivate && otherUserId && onlineUsers.some((u: any) => u.id === otherUserId);
              const isSelected = chatId === chat.id;
              
              return (
                <div
                  key={chat.id}
                  className={`p-3 rounded-lg mb-2 transition-all duration-200 ${
                    isSelected 
                      ? 'bg-white shadow-[0_0_15px_rgba(59,130,246,0.4)] backdrop-blur-sm ring-1 ring-blue-200/30 transform translate-y-[-2px]' 
                      : ' cursor-pointer hover:bg-chat-hover hover:bg-blue-50'
                  }`}
                  onClick={() => navigate(`/chat/${chat.id}`)}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center relative">
                      <span className="text-gray-600 font-semibold text-lg">
                        {isPrivate
                          ? chat.other_participant?.name?.charAt(0) || 'U'
                          : chat.name?.charAt(0) || 'G'
                        }
                      </span>
                      {isPrivate && isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" title="Online"></span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">
                        {isPrivate
                          ? chat.other_participant?.name || 'Unknown User'
                          : chat.name || 'Group'
                        }
                      </h3>
                      <p className="text-sm text-gray-500 truncate">
                        {chat.last_message?.content || 'No messages yet'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      {chat.unread_count > 0 && (
                        <div className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                          {chat.unread_count}
                        </div>
                      )}
                      <MdPlayArrow size={22} className='text-blue-800' />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showModal && <NewChatModal onClose={() => setShowModal(false)} />}
    </div>
  );
};

export default Sidebar; 
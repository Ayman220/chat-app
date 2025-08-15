import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { X, Search, Users } from 'lucide-react';
import { createChat } from '../../store/slices/chatSlice';
import { RootState, AppDispatch } from '../../store';
import { User, NewChatModalProps } from '../../types';
import api from '../../services/api';
import LoadingSpinner from '../common/LoadingSpinner';

const NewChatModal: React.FC<NewChatModalProps> = ({ onClose }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [chatType, setChatType] = useState<'private' | 'group'>('private');
  const [groupName, setGroupName] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim().length > 0) {
        fetchUsers(searchQuery);
        setHasSearched(true);
      } else if (hasSearched) {
        // Clear results when search is empty
        setUsers([]);
        setHasSearched(false);
      }
    }, 500); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Fetch users based on search query
  const fetchUsers = async (query: string) => {
    if (query.trim().length === 0) return;
    
    setSearchLoading(true);
    try {
      const response = await api.get(`/users?search=${encodeURIComponent(query)}`);
      if (response.data.success) {
        const filteredUsers = response.data.data.filter((u: User) => u.id !== user?.id);
        setUsers(filteredUsers);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setUsers([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleUserToggle = (userId: string) => {
    if (chatType === 'private') {
      setSelectedUsers([userId]);
    } else {
      setSelectedUsers(prev =>
        prev.includes(userId)
          ? prev.filter(id => id !== userId)
          : [...prev, userId]
      );
    }
  };

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0) return;

    setLoading(true);
    try {
      const chatData = {
        type: chatType,
        participants: selectedUsers,
        name: chatType === 'group' ? groupName : undefined
      };

      await dispatch(createChat(chatData));
      onClose();
    } catch (error) {
      console.error('Failed to create chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    if (chatType === 'private') {
      return selectedUsers.length === 1;
    } else {
      return selectedUsers.length > 0 && groupName.trim().length > 0;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">New Chat</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Chat Type Selection */}
        <div className="mb-4">
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="private"
                checked={chatType === 'private'}
                onChange={(e) => {
                  setChatType(e.target.value as 'private' | 'group');
                  setSelectedUsers([]);
                }}
                className="mr-2"
              />
              Private Chat
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="group"
                checked={chatType === 'group'}
                onChange={(e) => {
                  setChatType(e.target.value as 'private' | 'group');
                  setSelectedUsers([]);
                }}
                className="mr-2"
              />
              Group Chat
            </label>
          </div>
        </div>

        {/* Group Name Input */}
        {chatType === 'group' && (
          <div className="mb-4">
            <input
              type="text"
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* User Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Start typing to search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchLoading && (
              <LoadingSpinner size="sm" />
            )}
          </div>
        </div>

        {/* User List */}
        <div className="max-h-60 overflow-y-auto mb-4">
          {!hasSearched ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400 mb-2" />
              <p className="text-gray-500 text-sm">Start typing to search for users</p>
            </div>
          ) : searchLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <p className="text-gray-500 text-sm">Searching users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No users found</p>
              <p className="text-gray-400 text-xs mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedUsers.includes(user.id)
                      ? 'bg-blue-100 border border-blue-300'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleUserToggle(user.id)}
                >
                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center mr-3">
                    <span className="text-gray-600 font-semibold text-sm">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{user.name}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                  {selectedUsers.includes(user.id) && (
                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateChat}
            disabled={!isFormValid() || loading}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating...' : 'Create Chat'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewChatModal; 
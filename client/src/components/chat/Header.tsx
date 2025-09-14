import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Menu, User, LogOut, Settings, Bell } from 'lucide-react';
import { RootState, AppDispatch } from '../../store';
import { formatLastSeen } from '../../utils/timeUtils';
import { performLogout } from '../../store/actions/logout';

interface HeaderProps {
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, showMenuButton = true }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { currentChat } = useSelector((state: RootState) => state.chat);
  const { onlineUsers, lastSeen } = useSelector((state: RootState) => state.ui);
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = () => {
    dispatch(performLogout());
    navigate('/login');
  };

  const handleProfileClick = () => {
    setShowProfileMenu(!showProfileMenu);
  };

  // Real-time last seen timer
  useEffect(() => {
    // Clear existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // Only start timer if we have a private chat with last seen data
    const shouldStartTimer = currentChat?.type === 'private' &&
      currentChat.other_participant?.id &&
      !onlineUsers.some(u => u.id === currentChat.other_participant?.id) &&
      lastSeen[currentChat.other_participant.id];

    if (shouldStartTimer) {
      // Update every minute (60000ms)
      timerRef.current = setInterval(() => {
        setCurrentTime(Date.now());
      }, 60000);
    }

    // Cleanup timer on unmount or when dependencies change
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentChat, onlineUsers, lastSeen]);

  // Update current time when component mounts or chat changes
  useEffect(() => {
    setCurrentTime(Date.now());
  }, [currentChat]);

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
      {/* Left side - Menu button and chat info */}
      <div className="flex items-center space-x-3">
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
        )}

        {/* Chat info */}
        {currentChat && (
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {currentChat.type === 'private'
                  ? currentChat.other_participant?.name?.charAt(0).toUpperCase() || 'U'
                  : currentChat.name?.charAt(0).toUpperCase() || 'G'
                }
              </span>
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">
                {currentChat.type === 'private'
                  ? currentChat.other_participant?.name || 'Unknown User'
                  : currentChat.name || 'Group Chat'
                }
              </h1>
              {currentChat.type === 'private' && (
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${currentChat.other_participant?.id && onlineUsers.some(u => u.id === currentChat.other_participant?.id)
                    ? 'bg-green-500'
                    : 'bg-gray-400'
                    }`}></div>
                  <p className="text-sm text-gray-500">
                    {currentChat.other_participant?.id && onlineUsers.some(u => u.id === currentChat.other_participant?.id)
                      ? 'online'
                      : currentChat.other_participant?.id && lastSeen[currentChat.other_participant.id]
                        ? `last seen ${formatLastSeen(lastSeen[currentChat.other_participant.id], currentTime)}`
                        : 'offline'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right side - Profile and actions */}
      <div className="flex items-center space-x-2">
        {/* Notifications */}
        <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors relative">
          <Bell className="w-5 h-5 text-gray-600" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
            2
          </span>
        </button>

        {/* Settings */}
        <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Settings className="w-5 h-5 text-gray-600" />
        </button>

        {/* Profile dropdown */}
        <div className="relative">
          <button
            onClick={handleProfileClick}
            className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
          </button>

          {/* Profile dropdown menu */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="font-semibold text-gray-900">{user?.name}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
              </div>

              <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center space-x-2">
                <User className="w-4 h-4" />
                <span>Profile</span>
              </button>

              <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center space-x-2">
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>

              <div className="border-t border-gray-100 mt-1">
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center space-x-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Backdrop to close dropdown */}
      {showProfileMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowProfileMenu(false)}
        />
      )}
    </header>
  );
};

export default Header; 
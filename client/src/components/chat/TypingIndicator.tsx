import React from 'react';

interface TypingIndicatorProps {
    typingUsers: string[];
    currentUserId?: string;
    otherParticipantName?: string;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({
    typingUsers,
    currentUserId,
    otherParticipantName = 'Someone'
}) => {
    // Filter out current user from typing users
    const otherTypingUsers = typingUsers.filter(userId => userId !== currentUserId);

    if (otherTypingUsers.length === 0) {
        return null;
    }

    const getTypingText = () => {
        if (otherTypingUsers.length === 1) {
            return `${otherParticipantName} is typing`;
        } else {
            return `${otherTypingUsers.length} people are typing`;
        }
    };

    return (
        <div className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
            <span>{getTypingText()}</span>
            <div className="flex space-x-1">
                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
        </div>
    );
};

export default TypingIndicator;

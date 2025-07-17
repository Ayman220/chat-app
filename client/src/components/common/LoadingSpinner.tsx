import React from 'react';
import { LoadingSpinnerProps } from '../../types';

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`${sizeClasses[size]} border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin`}
      />
    </div>
  );
};

export default LoadingSpinner; 
import React from 'react';
import toast from 'react-hot-toast';

interface CustomToastProps {
  message: string;
  onClick?: () => void;
  duration?: number;
  type?: 'success' | 'error' | 'loading' | 'blank';
}

export const showToast = ({ 
  message, 
  onClick, 
  duration = 4000, 
  type = 'success' 
}: CustomToastProps) => {
  const toastContent = onClick ? (
    <div 
      onClick={onClick}
      className="cursor-pointer hover:opacity-80 transition-opacity"
    >
      {message}
    </div>
  ) : (
    <div>{message}</div>
  );

  switch (type) {
    case 'success':
      return toast.success(toastContent, { duration });
    case 'error':
      return toast.error(toastContent, { duration });
    case 'loading':
      return toast.loading(toastContent, { duration });
    case 'blank':
      return toast(toastContent, { duration });
    default:
      return toast.success(toastContent, { duration });
  }
};

export default showToast;

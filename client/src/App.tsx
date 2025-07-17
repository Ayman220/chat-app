import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { store } from './store';
import { useDispatch, useSelector } from 'react-redux';
import { verifyToken } from './store/slices/authSlice';
import { setTheme } from './store/slices/uiSlice';
import { RootState, AppDispatch } from './store';

// Components
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import ChatApp from './components/chat/ChatApp';
import LoadingSpinner from './components/common/LoadingSpinner';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useSelector((state: RootState) => state.auth);
  
  if (loading) {
    return <LoadingSpinner size="lg" />;
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

// Public Route Component (redirect if authenticated)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useSelector((state: RootState) => state.auth);
  
  if (loading) {
    return <LoadingSpinner size="lg" />;
  }
  
  return !isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
};

// App Content Component
const AppContent: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { theme } = useSelector((state: RootState) => state.ui);
  const { loading } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    // Initialize theme
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    // Verify token on app load
    dispatch(verifyToken());
  }, [dispatch]);

  if (loading) {
    return <LoadingSpinner size="lg" />;
  }

  return (
    <Router>
      <div className="App min-h-screen bg-chat-bg dark:bg-dark-bg">
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } />
          <Route path="/register" element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          } />
          <Route path="/forgot-password" element={
            <PublicRoute>
              <ForgotPassword />
            </PublicRoute>
          } />
          <Route path="/reset-password" element={
            <PublicRoute>
              <ResetPassword />
            </PublicRoute>
          } />
          
          {/* Protected Routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <ChatApp />
            </ProtectedRoute>
          } />
          <Route path="/chat/:chatId?" element={
            <ProtectedRoute>
              <ChatApp />
            </ProtectedRoute>
          } />
          
          {/* Catch all route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        
        {/* Toast notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: theme === 'dark' ? '#1e293b' : '#ffffff',
              color: theme === 'dark' ? '#f1f5f9' : '#1e293b',
              border: `1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'}`,
            },
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#ffffff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#ffffff',
              },
            },
          }}
        />
      </div>
    </Router>
  );
};

// Main App Component
const App: React.FC = () => {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
};

export default App; 
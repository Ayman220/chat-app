import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { initializeFCM, clearError } from '../../store/slices/authSlice';
import { Bell, BellOff, CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import fcmService from '../../services/fcm';

const NotificationSetup: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { loading, error } = useSelector((state: RootState) => state.auth);
    const [isSupported, setIsSupported] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
    const [isInitialized, setIsInitialized] = useState(false);
    const [showSetup, setShowSetup] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        // Check if FCM is supported
        const supported = fcmService.isSupported();
        setIsSupported(supported);

        // Check current permission status
        if ('Notification' in window) {
            setPermissionStatus(Notification.permission);
        }

        // Check if FCM is already initialized
        setIsInitialized(fcmService.getInitializationStatus());

        // Show setup if notifications are not enabled
        if (supported && Notification.permission === 'default') {
            setShowSetup(true);
        }
    }, []);

    const handleInitializeFCM = async () => {
        try {
            const result = await dispatch(initializeFCM()).unwrap();
            setIsInitialized(true);
            setPermissionStatus(Notification.permission);
            setShowSetup(false);
            setIsDismissed(false);
        } catch (error) {
            console.error('FCM initialization failed:', error);
        }
    };

    const handleDismiss = () => {
        setShowSetup(false);
        setIsDismissed(true);
        dispatch(clearError());
    };

    if (!isSupported) {
        return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
                    <span className="text-yellow-800 text-sm">
                        Push notifications are not supported in this browser.
                    </span>
                </div>
            </div>
        );
    }

    if (showSetup) {
        return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 mt-2 mr-2">
                <div className="flex items-start">
                    <Bell className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
                    <div className="flex-1">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <h3 className="text-blue-800 font-medium text-sm mb-1">
                                    Enable Push Notifications
                                </h3>
                                <p className="text-blue-700 text-sm mb-3">
                                    Get notified when you receive new messages, even when the app is closed.
                                </p>
                            </div>
                            <button
                                onClick={handleDismiss}
                                className="text-blue-400 hover:text-blue-600 ml-2"
                                title="Dismiss"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={handleInitializeFCM}
                                disabled={loading}
                                className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Setting up...' : 'Enable Notifications'}
                            </button>
                            <button
                                onClick={handleDismiss}
                                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                                Not now
                            </button>
                        </div>
                        {error && (
                            <p className="text-red-600 text-xs mt-2">
                                {error}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Don't show anything if user has dismissed the setup
    if (isDismissed) {
        return null;
    }

    return (
        permissionStatus === 'denied' ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center text-red-500">
                        Notification Permission Denied
                    </div>
                    <button
                        onClick={() => setShowSetup(true)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                        Retry Setup
                    </button>
                </div>
            </div>
        ) : <></>
    );
};

export default NotificationSetup;

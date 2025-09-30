import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import api from './api';

// Firebase configuration
const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
    measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

class FCMService {
    private messaging: Messaging | null = null;
    private isInitialized = false;

    constructor() {
        this.initializeMessaging();
    }

    private async initializeMessaging() {
        try {
            // Check if service worker is supported
            if ('serviceWorker' in navigator) {
                // Register service worker for FCM
                const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

                // Initialize messaging
                this.messaging = getMessaging(app);
                this.isInitialized = true;

                // Set up message listener
                this.setupMessageListener();
            } else {
                console.warn('Service Worker not supported');
            }
        } catch (error) {
            console.error('Error initializing FCM:', error);
        }
    }

    private setupMessageListener() {
        if (!this.messaging) return;

        onMessage(this.messaging, (payload) => {
            // Handle foreground messages
            this.handleForegroundMessage(payload);
        });
    }

    private handleForegroundMessage(payload: any) {
        const { notification, data } = payload;

        if (notification) {
            // Only show notification if the tab is visible (active)
            // Service worker will handle notifications when tab is not active
            if (Notification.permission === 'granted' && document.visibilityState === 'visible') {
                const notificationOptions = {
                    body: notification.body,
                    icon: notification.icon || '/logo192.png',
                    badge: '/logo192.png',
                    tag: data?.chatId || 'chat-notification',
                    data: data,
                    requireInteraction: false,
                    silent: false
                };

                const browserNotification = new Notification(notification.title, notificationOptions);

                // Handle notification click
                browserNotification.onclick = () => {
                    window.focus();
                    browserNotification.close();

                    // Navigate to the chat if data is available
                    if (data?.chatId) {
                        window.dispatchEvent(new CustomEvent('notification-clicked', {
                            detail: { chatId: data.chatId, chatType: data.chatType }
                        }));
                    }
                };

                // Auto-close notification after 5 seconds
                setTimeout(() => {
                    browserNotification.close();
                }, 5000);
            }
        }
    }


    /**
     * Request notification permission
     */
    async requestPermission(): Promise<boolean> {
        try {
            if (!('Notification' in window)) {
                console.warn('This browser does not support notifications');
                return false;
            }

            if (Notification.permission === 'granted') {
                return true;
            }

            if (Notification.permission === 'denied') {
                console.warn('Notification permission denied');
                return false;
            }

            const permission = await Notification.requestPermission();
            return permission === 'granted';
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }

    /**
     * Get FCM token
     */
    async getToken(): Promise<string | null> {
        try {
            if (!this.messaging || !this.isInitialized) {
                console.warn('FCM not initialized');
                return null;
            }

            const token = await getToken(this.messaging, {
                vapidKey: process.env.REACT_APP_FIREBASE_VAPID_KEY
            });

            if (token) {
                return token;
            } else {
                console.warn('No registration token available');
                return null;
            }
        } catch (error) {
            console.error('Error getting FCM token:', error);
            return null;
        }
    }

    /**
     * Register FCM token with server
     */
    async registerToken(token: string): Promise<boolean> {
        try {
            const response = await api.post('/auth/fcm-token', { token });
            return response.data.success;
        } catch (error) {
            console.error('Error registering FCM token:', error);
            return false;
        }
    }

    /**
     * Remove FCM token from server
     */
    async removeToken(): Promise<boolean> {
        try {
            const response = await api.delete('/auth/fcm-token');
            return response.data.success;
        } catch (error) {
            console.error('Error removing FCM token:', error);
            return false;
        }
    }

    /**
     * Initialize FCM for the current user
     */
    async initialize(): Promise<boolean> {
        try {
            // Request permission
            const hasPermission = await this.requestPermission();
            if (!hasPermission) {
                console.warn('Notification permission not granted');
                return false;
            }

            // Get token
            const token = await this.getToken();
            if (!token) {
                console.warn('Failed to get FCM token');
                return false;
            }

            // Register token with server
            const registered = await this.registerToken(token);
            if (!registered) {
                console.warn('Failed to register FCM token');
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error initializing FCM:', error);
            return false;
        }
    }

    /**
     * Check if FCM is supported
     */
    isSupported(): boolean {
        return 'serviceWorker' in navigator && 'Notification' in window;
    }

    /**
     * Check if FCM is initialized
     */
    getInitializationStatus(): boolean {
        return this.isInitialized;
    }
}

export const fcmService = new FCMService();
export default fcmService;

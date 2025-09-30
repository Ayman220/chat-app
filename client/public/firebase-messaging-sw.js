// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-auth-domain",
    projectId: "your-project-id",
    storageBucket: "your-storage-bucket",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id"
};

firebase.initializeApp(firebaseConfig);

// Get messaging instance
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    // Check if the tab is currently active
    // If it is, skip showing notification to prevent duplicates
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        const isTabActive = clients.some(client => client.visibilityState === 'visible');

        if (isTabActive) {
            return;
        }

        const notificationTitle = payload.notification?.title || 'New Message';
        const notificationOptions = {
            body: payload.notification?.body || 'You have a new message',
            icon: payload.notification?.icon || '/logo192.png',
            badge: '/logo192.png',
            tag: payload.data?.chatId || 'chat-notification',
            data: payload.data,
            requireInteraction: false,
            silent: false,
            actions: [
                {
                    action: 'open',
                    title: 'Open Chat'
                },
                {
                    action: 'close',
                    title: 'Close'
                }
            ]
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
    });
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    // Handle opening the chat
    const chatId = event.notification.data?.chatId;
    const chatType = event.notification.data?.chatType;

    if (chatId) {
        // Open the app and navigate to the specific chat
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then((clientList) => {
                // Check if the app is already open
                for (const client of clientList) {
                    if (client.url.includes(window.location.origin) && 'focus' in client) {
                        // App is open, focus it and navigate to chat
                        client.focus();
                        client.postMessage({
                            type: 'navigate-to-chat',
                            chatId: chatId,
                            chatType: chatType
                        });
                        return;
                    }
                }

                // App is not open, open it
                if (clients.openWindow) {
                    return clients.openWindow(`/?chat=${chatId}`);
                }
            })
        );
    } else {
        // No specific chat, just open the app
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes(window.location.origin) && 'focus' in client) {
                        client.focus();
                        return;
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
        );
    }
});

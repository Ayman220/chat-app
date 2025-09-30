# Firebase Cloud Messaging (FCM) Setup Guide

This guide will help you set up Firebase Cloud Messaging for push notifications in your chat application.

## Prerequisites

1. A Firebase project
2. A web app registered in your Firebase project
3. A service account key for Firebase Admin SDK

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or select an existing project
3. Follow the setup wizard

## Step 2: Add Web App to Firebase Project

1. In your Firebase project, click the web icon (`</>`) to add a web app
2. Register your app with a nickname
3. Copy the Firebase configuration object

## Step 3: Enable Cloud Messaging

1. In your Firebase project, go to "Cloud Messaging" in the left sidebar
2. Click "Get started" if you haven't enabled it yet

## Step 4: Generate VAPID Key

1. In Cloud Messaging settings, go to "Web configuration"
2. Click "Generate key pair" to create a VAPID key
3. Copy the key pair

## Step 5: Create Service Account

1. Go to Project Settings > Service Accounts
2. Click "Generate new private key"
3. Download the JSON file (keep it secure!)

## Step 6: Configure Environment Variables

### Server (.env)

Add the following to your server `.env` file:

```env
# Firebase Configuration (for FCM)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project-id",...}
```

**Important**: The `FIREBASE_SERVICE_ACCOUNT_KEY` should be the entire JSON content from your service account file, properly escaped as a single line.

### Client (.env)

Add the following to your client `.env` file:

```env
# Firebase Configuration (for FCM)
REACT_APP_FIREBASE_API_KEY=your-firebase-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
REACT_APP_FIREBASE_APP_ID=your-app-id
REACT_APP_FIREBASE_MEASUREMENT_ID=your-measurement-id
REACT_APP_FIREBASE_VAPID_KEY=your-vapid-key
```

## Step 7: Update Service Worker

The service worker file (`client/public/firebase-messaging-sw.js`) needs to be updated with your Firebase configuration:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-auth-domain",
  projectId: "your-project-id",
  storageBucket: "your-storage-bucket",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

## Step 8: Test the Setup

1. Start your development server
2. Open the chat application
3. Look for the notification setup banner
4. Click "Enable Notifications"
5. Grant permission when prompted
6. Click "Test Notification" to verify it works

## Features

### What's Included

- **Automatic FCM token registration** when users log in
- **Push notifications** for new messages (direct and group chats)
- **Background notifications** when the app is closed
- **Foreground notifications** when the app is open
- **Notification click handling** to navigate to specific chats
- **Permission management** with user-friendly setup UI
- **Test notification** functionality

### Notification Types

1. **Direct Messages**: Notifies the recipient when they receive a new message
2. **Group Messages**: Notifies all group members (except the sender) when a new message is posted
3. **Test Notifications**: Allows users to test if notifications are working

### Notification Content

- **Title**: Sender name (for direct) or "Sender in group" (for group)
- **Body**: Message content (truncated if too long)
- **Icon**: Sender avatar or app icon
- **Data**: Chat ID, chat type, sender info for navigation

## Troubleshooting

### Common Issues

1. **"FCM not initialized"**: Check if Firebase configuration is correct
2. **"No FCM token found"**: Ensure user has granted notification permission
3. **"Invalid registration token"**: Token may have expired, user needs to re-enable notifications
4. **Notifications not showing**: Check browser notification settings

### Browser Compatibility

- **Chrome**: Full support
- **Firefox**: Full support
- **Safari**: Limited support (iOS Safari has restrictions)
- **Edge**: Full support

### Security Notes

- Keep your service account key secure
- Never commit Firebase keys to version control
- Use environment variables for all sensitive configuration
- Regularly rotate your service account keys

## API Endpoints

The following endpoints are available for FCM management:

- `POST /api/auth/fcm-token` - Register FCM token
- `DELETE /api/auth/fcm-token` - Remove FCM token

## Database Changes

The following database changes were made:

- Added `fcm_token` field to the `User` model
- Migration created: `20250930175402_add_fcm_token`

## Files Modified/Created

### Server
- `server/services/fcm.ts` - FCM service for server-side notifications
- `server/routes/auth.ts` - Added FCM token management endpoints
- `server/routes/messages.ts` - Integrated FCM notifications with message sending
- `prisma/schema.prisma` - Added fcm_token field to User model

### Client
- `client/src/services/fcm.ts` - Client-side FCM service
- `client/src/components/common/NotificationSetup.tsx` - Notification setup UI
- `client/src/store/slices/authSlice.ts` - Added FCM actions
- `client/src/components/chat/ChatApp.tsx` - Added notification setup component
- `client/public/firebase-messaging-sw.js` - Service worker for background notifications

### Configuration
- `env.example` - Added Firebase configuration
- `client/env.development.example` - Added Firebase configuration
- `client/env.production.example` - Added Firebase configuration

## Next Steps

1. Set up your Firebase project
2. Configure environment variables
3. Test notifications in development
4. Deploy and test in production
5. Monitor notification delivery in Firebase Console

For more information, refer to the [Firebase Cloud Messaging documentation](https://firebase.google.com/docs/cloud-messaging).

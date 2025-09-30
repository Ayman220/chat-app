import admin from 'firebase-admin';
import { PrismaClient } from '../generated/prisma';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    try {
        // Try to read service account key from file
        const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    } catch (error) {
        console.warn('Firebase service account key file not found. Push notifications will be disabled.');
        console.warn('Expected file location: firebase-service-account.json in project root');
    }
}

export interface NotificationPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
    imageUrl?: string;
}

export interface MessageNotification {
    chatId: string;
    chatType: 'direct' | 'group';
    senderName: string;
    messageContent: string;
    senderAvatar?: string;
}

class FCMService {
    private isInitialized(): boolean {
        return admin.apps.length > 0;
    }

    /**
     * Send push notification to a specific user
     */
    async sendToUser(userId: string, payload: NotificationPayload): Promise<boolean> {
        if (!this.isInitialized()) {
            console.warn('FCM not initialized. Skipping notification.');
            return false;
        }

        try {
            // Get user's FCM token
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { fcm_token: true, name: true }
            });

            if (!user || !user.fcm_token) {
                return false;
            }

            const message = {
                token: user.fcm_token,
                notification: {
                    title: payload.title,
                    body: payload.body,
                    imageUrl: payload.imageUrl
                },
                data: payload.data || {},
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1
                        }
                    }
                },
                android: {
                    notification: {
                        sound: 'default',
                        channelId: 'chat_notifications'
                    }
                }
            };

            const response = await admin.messaging().send(message);
            return true;
        } catch (error: any) {
            console.error('Error sending FCM message:', error);

            // If token is invalid, remove it from database
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
                await this.removeToken(userId);
            }

            return false;
        }
    }

    /**
     * Send push notification to multiple users
     */
    async sendToMultipleUsers(userIds: string[], payload: NotificationPayload): Promise<number> {
        if (!this.isInitialized()) {
            console.warn('FCM not initialized. Skipping notifications.');
            return 0;
        }

        let successCount = 0;

        for (const userId of userIds) {
            const success = await this.sendToUser(userId, payload);
            if (success) successCount++;
        }

        return successCount;
    }

    /**
     * Send message notification
     */
    async sendMessageNotification(
        recipientId: string,
        messageData: MessageNotification
    ): Promise<boolean> {
        const payload: NotificationPayload = {
            title: messageData.chatType === 'direct'
                ? messageData.senderName
                : `${messageData.senderName} in ${messageData.chatType}`,
            body: messageData.messageContent,
            data: {
                chatId: messageData.chatId,
                chatType: messageData.chatType,
                senderName: messageData.senderName,
                type: 'new_message'
            },
            imageUrl: messageData.senderAvatar
        };

        return await this.sendToUser(recipientId, payload);
    }

    /**
     * Send message notification to group members (excluding sender)
     */
    async sendGroupMessageNotification(
        groupId: string,
        senderId: string,
        messageData: Omit<MessageNotification, 'chatId' | 'chatType'>
    ): Promise<number> {
        try {
            // Get all group participants except the sender
            const participants = await prisma.groupChatParticipant.findMany({
                where: {
                    group_chat_id: groupId,
                    user_id: { not: senderId }
                },
                select: {
                    user_id: true,
                    user: {
                        select: {
                            fcm_token: true,
                            name: true
                        }
                    }
                }
            });

            const userIds = participants
                .filter(p => p.user.fcm_token)
                .map(p => p.user_id);

            if (userIds.length === 0) {
                return 0;
            }

            const payload: NotificationPayload = {
                title: `${messageData.senderName} in group`,
                body: messageData.messageContent,
                data: {
                    chatId: groupId,
                    chatType: 'group',
                    senderName: messageData.senderName,
                    type: 'new_message'
                },
                imageUrl: messageData.senderAvatar
            };

            return await this.sendToMultipleUsers(userIds, payload);
        } catch (error) {
            console.error('Error sending group message notification:', error);
            return 0;
        }
    }

    /**
     * Update user's FCM token
     */
    async updateToken(userId: string, token: string): Promise<boolean> {
        try {
            await prisma.user.update({
                where: { id: userId },
                data: { fcm_token: token }
            });
            return true;
        } catch (error) {
            console.error('Error updating FCM token:', error);
            return false;
        }
    }

    /**
     * Remove user's FCM token
     */
    async removeToken(userId: string): Promise<boolean> {
        try {
            await prisma.user.update({
                where: { id: userId },
                data: { fcm_token: null }
            });
            return true;
        } catch (error) {
            console.error('Error removing FCM token:', error);
            return false;
        }
    }
}

export const fcmService = new FCMService();
export default fcmService;

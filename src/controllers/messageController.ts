import { Request, Response } from "express";
import { Message } from "../models/Message";
import { Conversation } from "../models/Conversation";
import { ConversationParticipant } from "../models/ConversationParticipant";

const HISTORY_LIMIT = 50;

export const getConversationHistory = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { conversationId } = req.params;

        if (!conversationId) {
            res.status(400).json({ message: "Conversation ID is required" });
            return;
        }

        // Deleted messages are intentionally still returned so the client
        // can render "This message was deleted".
        const messages = await Message.find({ conversationId })
            .sort({ createdAt: -1 })
            .limit(HISTORY_LIMIT)
            .lean();

        res.json({ messages: messages.reverse() });
    } catch (error) {
        console.error("GET CONVERSATION HISTORY ERROR:", error);
        res.status(500).json({ message: "Failed to fetch conversation history" });
    }
};

export const getUnreadCounts = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { userId } = req.params;

        if (!userId) {
            res.status(400).json({ message: "User ID is required" });
            return;
        }

        const conversations = await ConversationParticipant.find({
            userId,
            leftAt: { $exists: false },
            unreadCount: { $gt: 0 },
        })
            .select("conversationId unreadCount")
            .lean();

        res.json({ conversations });
    } catch (error) {
        console.error("GET UNREAD COUNTS ERROR:", error);
        res.status(500).json({ message: "Failed to fetch unread counts" });
    }
};

export const getUserConversations = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { userId } = req.params;

        if (!userId) {
            res.status(400).json({ message: "User ID is required" });
            return;
        }

        const participants = await ConversationParticipant.find({
            userId,
            leftAt: { $exists: false },
        })
            .sort({ updatedAt: -1 })
            .lean();

        const conversationIds = participants.map((p) => p.conversationId);

        if (conversationIds.length === 0) {
            res.json({ conversations: [] });
            return;
        }

        const conversations = await Conversation.find({
            _id: { $in: conversationIds },
        })
            .sort({ updatedAt: -1 })
            .lean();

        const unreadMap = new Map(
            participants.map((p) => [p.conversationId.toString(), p.unreadCount])
        );

        const result = conversations.map((conversation) => ({
            ...conversation,
            unreadCount: unreadMap.get(conversation._id.toString()) || 0,
        }));

        res.json({ conversations: result });
    } catch (error) {
        console.error("GET USER CONVERSATIONS ERROR:", error);
        res.status(500).json({ message: "Failed to fetch conversations" });
    }
};

export const getChattedUsers = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { userId } = req.params;

        if (!userId) {
            res.status(400).json({ message: "User ID is required" });
            return;
        }

        const conversations = await Conversation.find({
            type: "private",
            participants: userId,
        })
            .select("participants")
            .lean();

        const chattedUsers = [
            ...new Set(
                conversations.flatMap((c) =>
                    c.participants.filter((p) => p !== userId)
                )
            ),
        ];

        res.json({ users: chattedUsers });
    } catch (error) {
        console.error("GET CHATTED USERS ERROR:", error);
        res.status(500).json({ message: "Failed to fetch chatted users" });
    }
};

/**
 * POST /api/messages/read
 * body: { conversationId, userId, messageId }
 *
 * WhatsApp-style "blue ticks": marks every message up to and including
 * `messageId` as read by `userId`, and resets that user's unreadCount
 * on the conversation participant record.
 */
export const markAsRead = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { conversationId, userId, messageId } = req.body;

        if (!conversationId || !userId || !messageId) {
            res.status(400).json({
                message: "conversationId, userId and messageId are required",
            });
            return;
        }

        const upToMessage = await Message.findById(messageId).lean();
        if (!upToMessage) {
            res.status(404).json({ message: "Message not found" });
            return;
        }

        await Message.updateMany(
            {
                conversationId,
                createdAt: { $lte: upToMessage.createdAt },
                senderId: { $ne: userId },
                readBy: { $ne: userId },
            },
            {
                $addToSet: { readBy: userId, deliveredTo: userId },
                $set: { status: "read" },
            }
        );

        await ConversationParticipant.updateOne(
            { conversationId, userId },
            {
                $set: {
                    unreadCount: 0,
                    lastReadMessageId: messageId,
                    lastReadAt: new Date(),
                },
            }
        );

        res.json({ message: "Marked as read" });
    } catch (error) {
        console.error("MARK AS READ ERROR:", error);
        res.status(500).json({ message: "Failed to mark messages as read" });
    }
};
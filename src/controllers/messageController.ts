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
            res.status(400).json({
                message: "Conversation ID is required",
            });
            return;
        }

        const messages = await Message.find({
            conversationId,
            deletedAt: { $exists: false },
        })
            .sort({ createdAt: -1 })
            .limit(HISTORY_LIMIT)
            .lean();

        res.json({
            messages: messages.reverse(),
        });
    } catch (error) {
        console.error(
            "GET CONVERSATION HISTORY ERROR:",
            error
        );

        res.status(500).json({
            message: "Failed to fetch conversation history",
        });
    }
};

export const getUnreadCounts = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { userId } = req.params;

        if (!userId) {
            res.status(400).json({
                message: "User ID is required",
            });
            return;
        }

        const conversations =
            await ConversationParticipant.find({
                userId,
                leftAt: { $exists: false },
                unreadCount: { $gt: 0 },
            })
                .select("conversationId unreadCount")
                .lean();

        res.json({
            conversations,
        });
    } catch (error) {
        console.error(
            "GET UNREAD COUNTS ERROR:",
            error
        );

        res.status(500).json({
            message: "Failed to fetch unread counts",
        });
    }
};

export const getUserConversations = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { userId } = req.params;

        if (!userId) {
            res.status(400).json({
                message: "User ID is required",
            });
            return;
        }

        const participants =
            await ConversationParticipant.find({
                userId,
                leftAt: { $exists: false },
            })
                .sort({ updatedAt: -1 })
                .lean();

        const conversationIds = participants.map(
            participant => participant.conversationId
        );

        if (conversationIds.length === 0) {
            res.json({
                conversations: [],
            });
            return;
        }

        const conversations =
            await Conversation.find({
                _id: { $in: conversationIds },
            })
                .sort({ updatedAt: -1 })
                .lean();

        const unreadMap = new Map(
            participants.map(participant => [
                participant.conversationId.toString(),
                participant.unreadCount,
            ])
        );

        const result = conversations.map(
            conversation => ({
                ...conversation,
                unreadCount:
                    unreadMap.get(
                        conversation._id.toString()
                    ) || 0,
            })
        );

        res.json({
            conversations: result,
        });
    } catch (error) {
        console.error(
            "GET USER CONVERSATIONS ERROR:",
            error
        );

        res.status(500).json({
            message: "Failed to fetch conversations",
        });
    }
};

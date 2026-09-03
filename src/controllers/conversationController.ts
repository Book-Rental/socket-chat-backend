import { Request, Response } from "express";
import { Conversation } from "../models/Conversation";
import { ConversationParticipant } from "../models/ConversationParticipant";
import { Message } from "../models/Message";

export const createPrivateConversation = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { user1, user2 } = req.body;

        if (!user1 || !user2) {
            res.status(400).json({ message: "user1 and user2 are required" });
            return;
        }

        if (user1 === user2) {
            res.status(400).json({ message: "Users must be different" });
            return;
        }

        const existingConversation = await Conversation.findOne({
            type: "private",
            participants: { $all: [user1, user2] },
        });

        if (existingConversation) {
            res.status(200).json({
                message: "Conversation already exists",
                conversation: existingConversation,
            });
            return;
        }

        const conversation = await Conversation.create({
            type: "private",
            conversationKey: [user1, user2].sort().join(":"),
            participants: [user1, user2],
            createdBy: user1,
            messageCount: 0,
        });

        await ConversationParticipant.insertMany([
            {
                conversationId: conversation._id,
                userId: user1,
                role: "member",
                unreadCount: 0,
                muted: false,
                archived: false,
            },
            {
                conversationId: conversation._id,
                userId: user2,
                role: "member",
                unreadCount: 0,
                muted: false,
                archived: false,
            },
        ]);

        res.status(201).json({
            message: "Conversation created successfully",
            conversation,
        });
    } catch (error) {
        console.error("CREATE PRIVATE CONVERSATION ERROR:", error);
        res.status(500).json({ message: "Failed to create conversation" });
    }
};

const HISTORY_LIMIT = 50;

/**
 * GET /api/conversations/:conversationId/details?userId=<me>&limit=50&before=<isoDate>
 *
 * One call, given just a conversationId, that replaces having to separately
 * hit /api/messages/conversation/:conversationId and
 * /api/messages/conversations/:userId and stitch the results together
 * yourself on the client.
 *
 * Returns:
 *   {
 *     conversation: {...conversation fields, unreadCount for `userId`},
 *     participants: [...ConversationParticipant docs],
 *     messages: [...last `limit` messages, oldest -> newest]
 *   }
 *
 * `userId` is optional but you should pass it (the currently logged-in
 * user) so `unreadCount` in the response reflects *their* unread count,
 * not some arbitrary participant's.
 *
 * `before` (ISO date string) lets you paginate older messages, e.g.
 * ?before=2026-09-02T10:25:16.874Z to load the page before that timestamp.
 */
export const getConversationDetails = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { conversationId } = req.params;
        const { userId, before } = req.query as {
            userId?: string;
            before?: string;
        };
        const limit = Math.min(Number(req.query.limit) || HISTORY_LIMIT, 100);

        if (!conversationId) {
            res.status(400).json({ message: "Conversation ID is required" });
            return;
        }

        const conversation = await Conversation.findById(conversationId).lean();

        if (!conversation) {
            res.status(404).json({ message: "Conversation not found" });
            return;
        }

        const participants = await ConversationParticipant.find({
            conversationId,
        }).lean();

        const messageQuery: Record<string, unknown> = { conversationId };
        if (before) {
            messageQuery.createdAt = { $lt: new Date(before) };
        }

        // Deleted messages are intentionally still returned so the client
        // can render "This message was deleted".
        const messages = await Message.find(messageQuery)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const me = userId
            ? participants.find((p) => p.userId === userId)
            : undefined;

        res.json({
            conversation: {
                ...conversation,
                unreadCount: me?.unreadCount ?? 0,
            },
            participants,
            messages: messages.reverse(),
        });
    } catch (error) {
        console.error("GET CONVERSATION DETAILS ERROR:", error);
        res.status(500).json({ message: "Failed to fetch conversation details" });
    }
};
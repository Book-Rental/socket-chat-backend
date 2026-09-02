import { Request, Response } from "express";
import { Conversation } from "../models/Conversation";
import { ConversationParticipant } from "../models/ConversationParticipant";

export const createPrivateConversation = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { user1, user2 } = req.body;

        if (!user1 || !user2) {
            res.status(400).json({
                message: "user1 and user2 are required",
            });
            return;
        }

        if (user1 === user2) {
            res.status(400).json({
                message: "Users must be different",
            });
            return;
        }

        // Check whether private conversation already exists
        const existingConversation =
            await Conversation.findOne({
                type: "private",
                participants: {
                    $all: [user1, user2],
                },
            });

        if (existingConversation) {
            res.status(200).json({
                message: "Conversation already exists",
                conversation: existingConversation,
            });
            return;
        }

        // Create conversation
        const conversation =
            await Conversation.create({
                type: "private",
                conversationKey: [user1, user2]
                    .sort()
                    .join(":"),
                participants: [user1, user2],
                createdBy: user1,
                messageCount: 0,
            });

        // Create participants
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
        console.error(
            "CREATE PRIVATE CONVERSATION ERROR:",
            error
        );

        res.status(500).json({
            message: "Failed to create conversation",
        });
    }
};
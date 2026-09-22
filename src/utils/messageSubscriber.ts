import mongoose from "mongoose";
import { messageSubClient } from "../config/redis";
import { Message } from "../models/Message";
import { Conversation } from "../models/Conversation";
import { ConversationParticipant } from "../models/ConversationParticipant";

const MESSAGE_CHANNEL = "chat:messages";

export const startMessageSubscriber = async (): Promise<void> => {
    await messageSubClient.subscribe(
        MESSAGE_CHANNEL,
        async (rawMessage) => {
            try {
                // console.log("Redis message received:", rawMessage);

                const data = JSON.parse(rawMessage);

                switch (data.action) {
                    case "edit":
                        await handleEdit(data);
                        break;

                    case "delete":
                        await handleDelete(data);
                        break;

                    case "delivered":
                        await handleDelivered(data);
                        break;

                    case "read":
                        await handleRead(data);
                        break;

                    case "create":
                    default:
                        // Untagged payloads (backward-compatible) are treated as new messages
                        await handleCreate(data);
                        break;
                }
            } catch (error) {
                console.error("MESSAGE SUBSCRIBER ERROR:", error);
            }
        }
    );

    console.log(`Subscribed to Redis channel: ${MESSAGE_CHANNEL}`);
};

async function handleCreate(messageData: any): Promise<void> {
    if (messageData.replyTo) {
        messageData.replyTo = new mongoose.Types.ObjectId(messageData.replyTo);
    }

    const savedMessage = await Message.findOneAndUpdate(
        { tempId: messageData.tempId },
        { $setOnInsert: messageData },
        {
            returnDocument: "after",
            upsert: true,
            timestamps: false,
        }
    );

    // Update conversation metadata only when the message was newly inserted.
    if (savedMessage) {
        await Conversation.findByIdAndUpdate(
            messageData.conversationId,
            {
                $set: {
                    lastMessageId: savedMessage._id,
                    lastMessageAt: savedMessage.createdAt,
                },
                $inc: { messageCount: 1 },
            }
        );

        for (const recipientId of messageData.recipientIds ?? []) {
            await ConversationParticipant.updateOne(
                {
                    conversationId: messageData.conversationId,
                    userId: recipientId,
                    leftAt: { $exists: false },
                },
                { $inc: { unreadCount: 1 } }
            );
        }
    }

    console.log("Message saved:", savedMessage._id.toString());
}

async function handleEdit(data: any): Promise<void> {
    await Message.findByIdAndUpdate(data.message.id, {
        $set: {
            content: data.message.content,
            editedAt: data.message.editedAt,
        },
    });

    console.log("Message edited:", data.message.id);
}

async function handleDelete(data: any): Promise<void> {
    if (data.forEveryone) {
        await Message.findByIdAndUpdate(data.messageId, {
            $set: {
                deletedForEveryone: true,
                deletedAt: data.deletedAt,
            },
            $unset: { content: "" },
        });

        for (const recipientId of data.recipients ?? []) {
            await ConversationParticipant.updateOne(
                {
                    conversationId: data.conversationId,
                    userId: recipientId,
                    unreadCount: { $gt: 0 },
                },
                { $inc: { unreadCount: -1 } }
            );
        }
    } else {
        await Message.findByIdAndUpdate(data.messageId, {
            $addToSet: { deletedFor: data.userId },
        });
    }

    console.log("Message deleted:", data.messageId, "forEveryone:", data.forEveryone);
}

async function handleDelivered(data: any): Promise<void> {
    await ConversationParticipant.updateOne(
        { conversationId: data.conversationId, userId: data.userId },
        {
            $set: {
                lastDeliveredMessageId: data.messageId,
                lastDeliveredAt: new Date(),
            },
        }
    );

    await Message.updateOne(
        { _id: data.messageId, status: "sent" },
        {
            $set: { status: "delivered" },
            $addToSet: { deliveredTo: data.userId },
        }
    );

    console.log("Message delivered:", data.messageId, "to:", data.userId);
}

async function handleRead(data: any): Promise<void> {
    await ConversationParticipant.updateOne(
        { conversationId: data.conversationId, userId: data.userId },
        {
            $set: {
                lastReadMessageId: data.messageId,
                lastReadAt: new Date(),
                unreadCount: 0,
            },
        }
    );

    await Message.updateMany(
        {
            conversationId: data.conversationId,
            senderId: { $ne: data.userId },
            createdAt: { $lte: data.upToCreatedAt },
            status: { $ne: "read" },
        },
        {
            $set: { status: "read" },
            $addToSet: { readBy: data.userId, deliveredTo: data.userId },
        }
    );

    console.log("Messages marked read up to:", data.messageId, "by:", data.userId);
}
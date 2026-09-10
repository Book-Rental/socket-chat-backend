import { Conversation } from "../models/Conversation";
import { ConversationParticipant } from "../models/ConversationParticipant";
import { Message } from "../models/Message";
import {
    buildMessageContent,
    isEmojiOnly,
    isValidMessageContent,
} from "../utils/Messagecontent.util";
import { pubClient } from "../config/redis";
import { Server } from "socket.io";
import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
} from "../types/types";

type IOServer = Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>;
import { getOnlineUser } from "../store";

const MESSAGE_CHANNEL = "chat:messages";

export async function sendMessageService(senderId: string, data: any) {
    const {
        conversationId,
        clientMessageId,
        type = "text",
        replyTo,
        ...contentFields
    } = data;

    if (!conversationId) throw new Error("Conversation ID is required");

    const builtContent = buildMessageContent(type, contentFields);

    if (!isValidMessageContent(type, builtContent)) {
        throw new Error("Message content is required");
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) throw new Error("Conversation not found");

    if (!conversation.participants.includes(senderId)) {
        throw new Error("You are not a participant in this conversation");
    }

    const otherParticipants = conversation.participants.filter(
        participant => participant !== senderId
    );

    const recipientId = otherParticipants[0];

    if (clientMessageId) {
        const existingMessage = await Message.findOne({
            conversationId,
            clientMessageId,
        });

        if (existingMessage) {
            return {
                message: existingMessage,
                duplicate: true,
                recipientId: undefined,
                otherParticipants,
                initialStatus: existingMessage.status,
                conversation,
                getParticipant: async (participantId: string) =>
                    ConversationParticipant.findOne({
                        conversationId: conversation._id,
                        userId: participantId,
                    }).lean(),
            };
        }
    }

    const recipientSocketId = recipientId
        ? await getOnlineUser(recipientId)
        : undefined;

    const initialStatus =
        conversation.type === "private" && recipientSocketId
            ? "delivered"
            : "sent";

    const message = await Message.create({
        conversationId,
        senderId,
        type,
        content: builtContent,
        clientMessageId,
        replyTo,
        status: initialStatus,
        deliveredTo:
            initialStatus === "delivered" && recipientId
                ? [recipientId]
                : [],
    });

    conversation.lastMessageId = message._id;
    conversation.lastMessageAt = message.createdAt;
    conversation.messageCount += 1;
    await conversation.save();

    for (const participantId of otherParticipants) {
        await ConversationParticipant.updateOne(
            {
                conversationId: conversation._id,
                userId: participantId,
                leftAt: { $exists: false },
            },
            { $inc: { unreadCount: 1 } }
        );

        if (
            initialStatus === "delivered" &&
            participantId === recipientId
        ) {
            await ConversationParticipant.updateOne(
                {
                    conversationId: conversation._id,
                    userId: participantId,
                },
                {
                    $set: {
                        lastDeliveredMessageId: message._id,
                        lastDeliveredAt: new Date(),
                    },
                }
            );
        }
    }

    // Redis Pub/Sub
    await pubClient.publish(
        MESSAGE_CHANNEL,
        JSON.stringify({
            messageId: message._id.toString(),
            recipientIds: otherParticipants,
        })
    );

    return {
        message,
        duplicate: false,
        recipientId,
        otherParticipants,
        initialStatus,
        conversation,
        getParticipant: async (participantId: string) =>
            ConversationParticipant.findOne({
                conversationId: conversation._id,
                userId: participantId,
            }).lean(),
    };
}

export async function editMessageService(
    userId: string,
    messageId: string,
    text: string
) {
    const trimmedText = text?.trim();
    if (!trimmedText) throw new Error("Message content is required");

    const message = await Message.findById(messageId);
    if (!message) throw new Error("Message not found");

    if (message.senderId !== userId) {
        throw new Error("You can only edit your own message");
    }

    if (message.deletedAt) {
        throw new Error("Deleted message cannot be edited");
    }

    message.content = {
        ...message.content,
        type: isEmojiOnly(trimmedText) ? "emoji" : "text",
        text: trimmedText,
    };

    message.editedAt = new Date();
    await message.save();

    const conversation = await Conversation.findById(
        message.conversationId
    ).lean();

    if (!conversation) throw new Error("Conversation not found");

    return { message, conversation };
}

export async function deleteMessageService(
    userId: string,
    messageId: string,
    forEveryone: boolean
) {
    const message = await Message.findById(messageId);
    if (!message) throw new Error("Message not found");

    if (message.senderId !== userId) {
        throw new Error("You can only delete your own message");
    }

    if (message.deletedAt) return null;

    const deletedAt = new Date();

    if (forEveryone) {
        message.deletedForEveryone = true;
        message.deletedAt = deletedAt;
        message.content = undefined;
    } else {
        message.deletedFor = [
            ...(message.deletedFor ?? []),
            userId,
        ];
    }

    await message.save();

    if (!forEveryone) {
        return {
            message,
            conversation: null,
            deletedAt,
            forEveryone: false,
        };
    }

    const conversation = await Conversation.findById(
        message.conversationId
    ).lean();

    if (!conversation) throw new Error("Conversation not found");

    return {
        message,
        conversation,
        deletedAt,
        forEveryone: true,
    };
}

export async function markMessageDeliveredService(
    userId: string,
    conversationId: string,
    messageId: string
) {
    const participant = await ConversationParticipant.findOne({
        conversationId,
        userId,
    });

    if (!participant) return null;

    participant.lastDeliveredMessageId = messageId as any;
    participant.lastDeliveredAt = new Date();
    await participant.save();

    const message = await Message.findById(messageId);
    if (!message) return null;

    if (!message.deliveredTo?.includes(userId)) {
        message.deliveredTo = [
            ...(message.deliveredTo ?? []),
            userId,
        ];
    }

    if (message.status === "sent") {
        message.status = "delivered";
    }

    await message.save();
    return message;
}

export async function markMessagesReadService(
    userId: string,
    conversationId: string,
    messageId: string
) {
    const participant = await ConversationParticipant.findOne({
        conversationId,
        userId,
    });

    if (!participant) return null;

    const upToMessage = await Message.findById(messageId).lean();
    if (!upToMessage) return null;

    participant.lastReadMessageId = messageId as any;
    participant.lastReadAt = new Date();
    participant.unreadCount = 0;
    await participant.save();

    await Message.updateMany(
        {
            conversationId,
            senderId: { $ne: userId },
            createdAt: { $lte: upToMessage.createdAt },
            status: { $ne: "read" },
        },
        {
            $set: { status: "read" },
            $addToSet: {
                readBy: userId,
                deliveredTo: userId,
            },
        }
    );

    return upToMessage;
}

export async function deliverPendingMessages(
    io: IOServer,
    userId: string
): Promise<void> {
    const participants = await ConversationParticipant.find({
        userId,
        leftAt: { $exists: false },
    })
        .select("conversationId")
        .lean();

    const conversationIds = participants.map(
        participant => participant.conversationId
    );

    if (!conversationIds.length) return;

    const pendingMessages = await Message.find({
        conversationId: { $in: conversationIds },
        senderId: { $ne: userId },
        status: "sent",
        deletedAt: { $exists: false },
    }).lean();

    for (const message of pendingMessages) {
        const updated = await Message.findOneAndUpdate(
            {
                _id: message._id,
                status: "sent",
            },
            { $set: { status: "delivered" } },
            { new: true }
        );

        if (!updated) continue;

        await ConversationParticipant.updateOne(
            {
                conversationId: message.conversationId,
                userId,
                leftAt: { $exists: false },
            },
            {
                $set: {
                    lastDeliveredMessageId: message._id,
                    lastDeliveredAt: new Date(),
                },
            }
        );

        const senderSocketId = await getOnlineUser(message.senderId);

        if (senderSocketId) {
            io.to(senderSocketId).emit("messageDelivered", {
                conversationId: message.conversationId.toString(),
                messageId: message._id.toString(),
                userId,
                status: "delivered",
            });
        }
    }
}

export async function forwardMessageService(
    senderId: string,
    messageId: string,
    targetConversationId: string,
    clientMessageId?: string
) {
    if (!messageId) {
        throw new Error("Message ID is required");
    }

    if (!targetConversationId) {
        throw new Error("Target conversation ID is required");
    }

    // 1. Find original message
    const originalMessage = await Message.findById(messageId).lean();

    if (!originalMessage) {
        throw new Error("Original message not found");
    }

    // 2. Do not allow forwarding deleted messages
    if (originalMessage.deletedAt || originalMessage.deletedForEveryone) {
        throw new Error("Deleted message cannot be forwarded");
    }

    // 3. Find target conversation
    const conversation = await Conversation.findById(
        targetConversationId
    );

    if (!conversation) {
        throw new Error("Target conversation not found");
    }

    // 4. Sender must belong to target conversation
    if (!conversation.participants.includes(senderId)) {
        throw new Error(
            "You are not a participant in the target conversation"
        );
    }

    // 5. Prevent duplicate forwarding
    if (clientMessageId) {
        const existingMessage = await Message.findOne({
            conversationId: targetConversationId,
            clientMessageId,
        });

        if (existingMessage) {
            return {
                message: existingMessage,
                conversation,
                duplicate: true,
                recipientIds: conversation.participants.filter(
                    participant => participant !== senderId
                ),
                initialStatus: existingMessage.status,
            };
        }
    }

    // 6. Find recipients
    const recipientIds = conversation.participants.filter(
        participant => participant !== senderId
    );

    // 7. For private chat, check recipient online status
    const recipientId =
        conversation.type === "private"
            ? recipientIds[0]
            : undefined;

    const recipientSocketId = recipientId
        ? await getOnlineUser(recipientId)
        : undefined;

    const initialStatus =
        conversation.type === "private" && recipientSocketId
            ? "delivered"
            : "sent";

    // 8. Create NEW message
    const forwardedMessage = await Message.create({
        conversationId: conversation._id,
        senderId,

        type: originalMessage.type,
        content: originalMessage.content,

        clientMessageId,

        status: initialStatus,

        forwarded: true,

        forwardCount: (originalMessage.forwardCount ?? 0) + 1,

        deliveredTo:
            initialStatus === "delivered" && recipientId
                ? [recipientId]
                : [],

        readBy: [],
        reactions: [],
        starredBy: [],
        deletedFor: [],
        deletedForEveryone: false,
    });

    // 9. Update conversation
    conversation.lastMessageId = forwardedMessage._id;
    conversation.lastMessageAt = forwardedMessage.createdAt;
    conversation.messageCount += 1;

    await conversation.save();

    // 10. Increase unread count for recipients
    for (const participantId of recipientIds) {
        await ConversationParticipant.updateOne(
            {
                conversationId: conversation._id,
                userId: participantId,
                leftAt: { $exists: false },
            },
            {
                $inc: {
                    unreadCount: 1,
                },
            }
        );

        // 11. Update delivered information
        if (
            initialStatus === "delivered" &&
            participantId === recipientId
        ) {
            await ConversationParticipant.updateOne(
                {
                    conversationId: conversation._id,
                    userId: participantId,
                },
                {
                    $set: {
                        lastDeliveredMessageId:
                            forwardedMessage._id,
                        lastDeliveredAt: new Date(),
                    },
                }
            );
        }
    }

    // 12. Publish through Redis
    await pubClient.publish(
        MESSAGE_CHANNEL,
        JSON.stringify({
            messageId: forwardedMessage._id.toString(),
            recipientIds,
        })
    );


    return {
        message: forwardedMessage,
        conversation,
        duplicate: false,
        recipientIds,
        recipientId,
        initialStatus,
    };
}
export async function forwardMessagesService(
    senderId: string,
    messageIds: string[],
    targetConversationId: string,
    clientMessageId?: string
) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
        throw new Error("Message IDs are required");
    }

    if (!targetConversationId) {
        throw new Error("Target conversation ID is required");
    }

    const results = [];

    for (let index = 0; index < messageIds.length; index++) {
        const messageId = messageIds[index];

        /*
         * Every forwarded message must have its own
         * clientMessageId so duplicate detection works.
         */
        const individualClientMessageId = clientMessageId
            ? `${clientMessageId}-${index}-${messageId}`
            : undefined;

        try {
            const result = await forwardMessageService(
                senderId,
                messageId,
                targetConversationId,
                individualClientMessageId
            );

            results.push(result);
        } catch (error) {
            console.error(
                `Failed to forward message ${messageId}:`,
                error
            );
        }
    }

    return results;
}
export async function deleteMessagesService(
    userId: string,
    messageIds: string[],
    forEveryone: boolean
) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
        throw new Error("Message IDs are required");
    }

    const results = [];

    for (const messageId of messageIds) {
        try {
            const result = await deleteMessageService(
                userId,
                messageId,
                forEveryone
            );

            if (result) {
                results.push(result);
            }
        } catch (error) {
            console.error(
                `Failed to delete message ${messageId}:`,
                error
            );
        }
    }

    return results;
}
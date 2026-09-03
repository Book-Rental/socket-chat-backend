import { Server, Socket } from "socket.io";

import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
    MessagePayload,
} from "../types/types";

import { Conversation } from "../models/Conversation";
import { ConversationParticipant } from "../models/ConversationParticipant";
import { Message } from "../models/Message";

import { onlineUsers } from "../store";
import { buildMessageContent, isEmojiOnly, isValidMessageContent } from "../models/Messagecontent.util";

type IOServer = Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>;

type IOSocket = Socket<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>;

function toMessagePayload(message: any): MessagePayload {
    return {
        id: message._id.toString(),
        conversationId: message.conversationId.toString(),
        senderId: message.senderId,
        type: message.type,
        content: message.content,
        clientMessageId: message.clientMessageId,
        replyTo: message.replyTo?.toString(),
        status: message.status,
        editedAt: message.editedAt?.toISOString(),
        deletedAt: message.deletedAt?.toISOString(),
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
    };
}

async function deliverPendingMessages(
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
        (participant) => participant.conversationId
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
            { _id: message._id, status: "sent" },
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

        const senderSocketId = onlineUsers.get(message.senderId);

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

export function registerOneToOneHandlers(
    io: IOServer,
    socket: IOSocket
): void {
    socket.on("registerUser", async (userId) => {
        try {
            const trimmedUserId = userId.trim();

            if (!trimmedUserId) {
                socket.emit("errorMessage", "Invalid username");
                return;
            }

            const previousUserId = socket.data.userId;

            if (previousUserId && previousUserId !== trimmedUserId) {
                const previousSocketId = onlineUsers.get(previousUserId);

                if (previousSocketId === socket.id) {
                    onlineUsers.delete(previousUserId);
                }
            }

            socket.data.userId = trimmedUserId;
            onlineUsers.set(trimmedUserId, socket.id);

            io.emit("onlineUsers", Array.from(onlineUsers.keys()));
            socket.broadcast.emit("userOnline", trimmedUserId);

            await deliverPendingMessages(io, trimmedUserId);
        } catch (error) {
            console.error("REGISTER USER ERROR:", error);
        }
    });

    socket.on("sendMessage", async (data) => {
        try {
            const senderId = socket.data.userId;

            if (!senderId) {
                socket.emit("errorMessage", "User is not registered");
                return;
            }

            const {
                conversationId,
                clientMessageId,
                type = "text",
                replyTo,
                ...contentFields
            } = data;

            if (!conversationId) {
                socket.emit("errorMessage", "Conversation ID is required");
                return;
            }

            /*
             * The client sends a flat payload (text / mediaUrl / caption /
             * latitude / etc. - see ClientToServerEvents.sendMessage in
             * types.ts). buildMessageContent() picks out only the fields
             * that belong to `type` and shapes them into the content
             * object we actually store; isValidMessageContent() checks
             * the result has what it needs before we save it.
             */
            const builtContent = buildMessageContent(type, contentFields);

            if (!isValidMessageContent(type, builtContent)) {
                socket.emit(
                    "errorMessage",
                    "Message content is required"
                );
                return;
            }

            const conversation = await Conversation.findById(conversationId);

            if (!conversation) {
                socket.emit("errorMessage", "Conversation not found");
                return;
            }

            if (!conversation.participants.includes(senderId)) {
                socket.emit(
                    "errorMessage",
                    "You are not a participant in this conversation"
                );
                return;
            }

            if (clientMessageId) {
                const existingMessage = await Message.findOne({
                    conversationId,
                    clientMessageId,
                });

                if (existingMessage) {
                    socket.emit(
                        "messageSent",
                        toMessagePayload(existingMessage)
                    );
                    return;
                }
            }

            const otherParticipants = conversation.participants.filter(
                (participant) => participant !== senderId
            );

            const recipientId = otherParticipants[0];

            const recipientSocketId = recipientId
                ? onlineUsers.get(recipientId)
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

            const payload = toMessagePayload(message);

            socket.emit("messageSent", payload);

            if (initialStatus === "delivered" && recipientId) {
                socket.emit("messageDelivered", {
                    conversationId: conversation._id.toString(),
                    messageId: message._id.toString(),
                    userId: recipientId,
                    status: "delivered",
                });
            }

            for (const participantId of otherParticipants) {
                const socketId = onlineUsers.get(participantId);

                if (!socketId) continue;

                io.to(socketId).emit("messageNew", payload);

                const participant = await ConversationParticipant.findOne({
                    conversationId: conversation._id,
                    userId: participantId,
                }).lean();

                io.to(socketId).emit("unreadCountUpdated", {
                    conversationId: conversation._id.toString(),
                    count: participant?.unreadCount ?? 0,
                });
            }

            io.emit("conversationUpdated", {
                id: conversation._id.toString(),
                type: conversation.type,
                name: conversation.name,
                description: conversation.description,
                createdBy: conversation.createdBy,
                participants: conversation.participants,
                lastMessageId: conversation.lastMessageId?.toString(),
                lastMessageAt: conversation.lastMessageAt?.toISOString(),
                messageCount: conversation.messageCount,
                createdAt: conversation.createdAt?.toISOString(),
                updatedAt: conversation.updatedAt?.toISOString(),
            });
        } catch (error) {
            console.error("SEND MESSAGE ERROR:", error);
            socket.emit("errorMessage", "Failed to send message");
        }
    });

    socket.on("editMessage", async ({ messageId, text }) => {
        try {
            const userId = socket.data.userId;

            if (!userId) {
                socket.emit("errorMessage", "User is not registered");
                return;
            }

            const trimmedText = text?.trim();

            if (!trimmedText) {
                socket.emit("errorMessage", "Message content is required");
                return;
            }

            const message = await Message.findById(messageId);

            if (!message) {
                socket.emit("errorMessage", "Message not found");
                return;
            }

            // Only the sender can edit their own message.
            if (message.senderId !== userId) {
                socket.emit(
                    "errorMessage",
                    "You can only edit your own message"
                );
                return;
            }

            // Deleted messages cannot be edited.
            if (message.deletedAt) {
                socket.emit(
                    "errorMessage",
                    "Deleted message cannot be edited"
                );
                return;
            }

            // Editing only makes sense for text-shaped content -
            // preserve any other fields (e.g. a caption stays a caption),
            // but recompute `type` in case the edit changed emoji-only-ness.
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

            if (!conversation) {
                socket.emit("errorMessage", "Conversation not found");
                return;
            }

            const payload = toMessagePayload(message);

            for (const participantId of conversation.participants) {
                const socketId = onlineUsers.get(participantId);
                if (!socketId) continue;

                io.to(socketId).emit("messageEdited", payload);
            }
        } catch (error) {
            console.error("EDIT MESSAGE ERROR:", error);
            socket.emit("errorMessage", "Failed to edit message");
        }
    });

    socket.on("deleteMessage", async ({ messageId, forEveryone }) => {
        try {
            const userId = socket.data.userId;

            if (!userId) {
                socket.emit("errorMessage", "User is not registered");
                return;
            }

            const message = await Message.findById(messageId);

            if (!message) {
                socket.emit("errorMessage", "Message not found");
                return;
            }

            // Only sender can delete
            if (message.senderId !== userId) {
                socket.emit(
                    "errorMessage",
                    "You can only delete your own message"
                );
                return;
            }

            // Already deleted
            if (message.deletedAt) {
                return;
            }

            const deletedAt = new Date();

            if (forEveryone) {
                message.deletedForEveryone = true;
                message.deletedAt = deletedAt;
                // Keep the MongoDB document, but remove the visible content.
                message.content = undefined;
            } else {
                // "Delete for me" - only hide it for this user.
                message.deletedFor = [
                    ...(message.deletedFor ?? []),
                    userId,
                ];
            }

            await message.save();

            // "Delete for me" is invisible to everyone else - nothing to broadcast.
            if (!forEveryone) {
                socket.emit("messageDeleted", {
                    messageId: message._id.toString(),
                    conversationId: message.conversationId.toString(),
                    deletedAt: deletedAt.toISOString(),
                    forEveryone: false,
                });
                return;
            }

            const conversation = await Conversation.findById(
                message.conversationId
            ).lean();

            if (!conversation) {
                socket.emit("errorMessage", "Conversation not found");
                return;
            }

            const payload = {
                messageId: message._id.toString(),
                conversationId: message.conversationId.toString(),
                deletedAt: deletedAt.toISOString(),
                forEveryone: true,
            };

            // Notify all participants
            for (const participantId of conversation.participants) {
                const socketId = onlineUsers.get(participantId);
                if (!socketId) continue;

                io.to(socketId).emit("messageDeleted", payload);
            }
        } catch (error) {
            console.error("DELETE MESSAGE ERROR:", error);
            socket.emit("errorMessage", "Failed to delete message");
        }
    });

    socket.on("messageDelivered", async ({ conversationId, messageId }) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return;

            const participant = await ConversationParticipant.findOne({
                conversationId,
                userId,
            });

            if (!participant) return;

            participant.lastDeliveredMessageId = messageId as any;
            participant.lastDeliveredAt = new Date();
            await participant.save();

            const message = await Message.findById(messageId);
            if (!message) return;

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

            const senderSocketId = onlineUsers.get(message.senderId);

            if (senderSocketId) {
                io.to(senderSocketId).emit("messageDelivered", {
                    conversationId,
                    messageId,
                    userId,
                    status: "delivered",
                });
            }
        } catch (error) {
            console.error("MESSAGE DELIVERED ERROR:", error);
        }
    });

    socket.on("messagesRead", async ({ conversationId, messageId }) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return;

            const participant = await ConversationParticipant.findOne({
                conversationId,
                userId,
            });

            if (!participant) return;

            const upToMessage = await Message.findById(messageId).lean();
            if (!upToMessage) return;

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
                    $addToSet: { readBy: userId, deliveredTo: userId },
                }
            );

            const senderSocketId = onlineUsers.get(upToMessage.senderId);

            if (senderSocketId) {
                io.to(senderSocketId).emit("messageRead", {
                    conversationId,
                    messageId,
                    userId,
                    status: "read",
                });
            }

            socket.emit("unreadCountUpdated", { conversationId, count: 0 });
        } catch (error) {
            console.error("MESSAGES READ ERROR:", error);
        }
    });

    socket.on("typingStarted", async ({ conversationId }) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return;

            const conversation = await Conversation.findById(
                conversationId
            ).lean();

            if (!conversation) return;

            conversation.participants
                .filter((participant) => participant !== userId)
                .forEach((participant) => {
                    const socketId = onlineUsers.get(participant);
                    if (socketId) {
                        io.to(socketId).emit("typingStarted", {
                            conversationId,
                            userId,
                        });
                    }
                });
        } catch (error) {
            console.error("TYPING STARTED ERROR:", error);
        }
    });

    socket.on("typingStopped", async ({ conversationId }) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return;

            const conversation = await Conversation.findById(
                conversationId
            ).lean();

            if (!conversation) return;

            conversation.participants
                .filter((participant) => participant !== userId)
                .forEach((participant) => {
                    const socketId = onlineUsers.get(participant);
                    if (socketId) {
                        io.to(socketId).emit("typingStopped", {
                            conversationId,
                            userId,
                        });
                    }
                });
        } catch (error) {
            console.error("TYPING STOPPED ERROR:", error);
        }
    });

    socket.on("disconnect", () => {
        const userId = socket.data.userId;
        if (!userId) return;

        const currentSocketId = onlineUsers.get(userId);

        if (currentSocketId === socket.id) {
            onlineUsers.delete(userId);
            io.emit("onlineUsers", Array.from(onlineUsers.keys()));
            socket.broadcast.emit("userOffline", userId);
        }
    });
}
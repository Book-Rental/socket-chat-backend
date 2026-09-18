import { Server, Socket } from "socket.io";
import {
    ClientToServerEvents, ServerToClientEvents,
    InterServerEvents, SocketData, MessagePayload
} from "../types/types";
import {
    sendMessageService, editMessageService, deleteMessageService,
    markMessageDeliveredService, markMessagesReadService,
    deliverPendingMessages, forwardMessageService,
    forwardMessagesService,
    deleteMessagesService
} from "../services/message.service";
import { Conversation } from "../models/Conversation";
import { ConversationParticipant } from "../models/ConversationParticipant";
import { Message } from "../models/Message";
import {
    setOnlineUser, getOnlineUser, removeOnlineUser, getOnlineUsers
} from "../store";
import { messageSubClient } from "../config/redis";
import { toMessagePayload } from "../utils/messagePayload.util";

type IOServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const MESSAGE_CHANNEL = "chat:messages";
// IOServer = entire Socket.IO server (io)
// IOSocket = one connected client (socket).



export function registerOneToOneHandlers(io: IOServer, socket: IOSocket): void {
    socket.on("registerUser", async userId => {
        try {
            if (socket.data.userId) {
                return;
            }
            const trimmedUserId = userId.trim();
            if (!trimmedUserId) {
                return socket.emit("errorMessage", "Invalid username");
            }
            socket.data.userId = trimmedUserId;
            await setOnlineUser(trimmedUserId, socket.id);

            io.emit("onlineUsers", await getOnlineUsers());

            await deliverPendingMessages(io, trimmedUserId);

        } catch (error) {
            console.error("REGISTER USER ERROR:", error);
        }
    });

    socket.on("sendMessage", async (data) => {
        try {
            const senderId = socket.data.userId;

            if (!senderId) {
                return socket.emit("errorMessage", "User is not registered");
            }

            const result = await sendMessageService(senderId, data);

            if (result.duplicate || !result.messagePayload) {
                return;
            }
            console.log("Message sent:", result.messagePayload);
            const allParticipants = [senderId, ...result.messagePayload.recipientIds];

            for (const participantId of allParticipants) {
                console.log(
                    "EMITTING messageSent TO:",
                    participantId,
                    "ROOM:",
                    `user:${participantId}`,
                    "MESSAGE:",
                    result.messagePayload.tempId
                );
                io.to(`user:${participantId}`).emit("messageSent", result.messagePayload);
            }
        } catch (error) {
            console.error("SEND MESSAGE ERROR:", error);
            socket.emit(
                "errorMessage",
                error instanceof Error ? error.message : "Failed to send message"
            );
        }
    });
    socket.on("forwardMessage", async data => {
        try {
            const senderId = socket.data.userId;

            if (!senderId) {
                return socket.emit(
                    "errorMessage",
                    "User is not registered"
                );
            }

            const result = await forwardMessageService(
                senderId,
                data.messageId,
                data.conversationId,
                data.clientMessageId
            );

            const payload = toMessagePayload(result.message);

            // Send the new forwarded message back to sender
            socket.emit("messageSent", payload);

            if (result.duplicate) {
                return;
            }

            // Notify sender about delivery for private chat
            if (
                result.initialStatus === "delivered" &&
                result.recipientId
            ) {
                socket.emit("messageDelivered", {
                    conversationId:
                        result.conversation._id.toString(),

                    messageId:
                        result.message._id.toString(),

                    userId: result.recipientId,

                    status: "delivered",
                });
            }

            // Update conversation list
            const c = result.conversation;

            io.emit("conversationUpdated", {
                id: c._id.toString(),
                type: c.type,
                name: c.name,
                description: c.description,
                createdBy: c.createdBy,
                participants: c.participants,
                lastMessageId:
                    c.lastMessageId?.toString(),
                lastMessageAt:
                    c.lastMessageAt?.toISOString(),
                messageCount: c.messageCount,
                createdAt:
                    c.createdAt?.toISOString(),
                updatedAt:
                    c.updatedAt?.toISOString(),
            });

        } catch (error) {
            console.error(
                "FORWARD MESSAGE ERROR:",
                error
            );

            socket.emit(
                "errorMessage",
                error instanceof Error
                    ? error.message
                    : "Failed to forward message"
            );
        }
    });
    socket.on("editMessage", async ({ messageId, text }) => {
        try {
            const userId = socket.data.userId;
            if (!userId)
                return socket.emit("errorMessage", "User is not registered");

            const result = await editMessageService(userId, messageId, text);
            const payload = toMessagePayload(result.message);

            for (const participantId of result.conversation.participants) {
                const socketId = await getOnlineUser(participantId);
                if (socketId) io.to(socketId).emit("messageEdited", payload);
            }
        } catch (error) {
            console.error("EDIT MESSAGE ERROR:", error);
            socket.emit(
                "errorMessage",
                error instanceof Error ? error.message : "Failed to edit message"
            );
        }
    });

    socket.on("deleteMessage", async ({ messageId, forEveryone }) => {
        try {
            const userId = socket.data.userId;
            if (!userId)
                return socket.emit("errorMessage", "User is not registered");

            const result = await deleteMessageService(
                userId, messageId, forEveryone ?? false
            );
            if (!result) return;

            const payload = {
                messageId: result.message._id.toString(),
                conversationId: result.message.conversationId.toString(),
                deletedAt: result.deletedAt.toISOString(),
                forEveryone: result.forEveryone,
            };

            if (!result.forEveryone)
                return socket.emit("messageDeleted", payload);

            for (const participantId of result.conversation!.participants) {
                const socketId = await getOnlineUser(participantId);
                if (socketId) io.to(socketId).emit("messageDeleted", payload);
            }
        } catch (error) {
            console.error("DELETE MESSAGE ERROR:", error);
            socket.emit(
                "errorMessage",
                error instanceof Error ? error.message : "Failed to delete message"
            );
        }
    });

    socket.on("messageDelivered", async ({ conversationId, messageId }) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return;

            const message = await markMessageDeliveredService(
                userId, conversationId, messageId
            );
            if (!message) return;

            const senderSocketId = await getOnlineUser(message.senderId);
            if (senderSocketId)
                io.to(senderSocketId).emit("messageDelivered", {
                    conversationId, messageId, userId, status: "delivered",
                });
        } catch (error) {
            console.error("MESSAGE DELIVERED ERROR:", error);
        }
    });

    socket.on("messagesRead", async ({ conversationId, messageId }) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return;

            const message = await markMessagesReadService(
                userId, conversationId, messageId
            );
            if (!message) return;

            const senderSocketId = await getOnlineUser(message.senderId);
            if (senderSocketId)
                io.to(senderSocketId).emit("messageRead", {
                    conversationId, messageId, userId, status: "read",
                });

            socket.emit("unreadCountUpdated", {
                conversationId, count: 0,
            });
        } catch (error) {
            console.error("MESSAGES READ ERROR:", error);
        }
    });

    const typing = async (
        conversationId: string,
        event: "typingStarted" | "typingStopped"
    ) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return;

            const conversation = await Conversation.findById(conversationId).lean();
            if (!conversation) return;

            for (const participant of conversation.participants.filter(p => p !== userId)) {
                const socketId = await getOnlineUser(participant);
                if (socketId)
                    io.to(socketId).emit(event, { conversationId, userId });
            }
        } catch (error) {
            console.error(`${event.toUpperCase()} ERROR: `, error);
        }
    };

    socket.on("typingStarted", ({ conversationId }) =>
        typing(conversationId, "typingStarted")
    );

    socket.on("typingStopped", ({ conversationId }) =>
        typing(conversationId, "typingStopped")
    );

    socket.on("disconnect", async () => {
        try {
            const userId = socket.data.userId;
            if (!userId) return;

            const currentSocketId = await getOnlineUser(userId);
            if (currentSocketId !== socket.id) return;

            await removeOnlineUser(userId, socket.id);

            io.emit("onlineUsers", await getOnlineUsers());
            socket.broadcast.emit("userOffline", userId);
        } catch (error) {
            console.error("DISCONNECT ERROR:", error);
        }
    });

    socket.on("forwardMessages", async data => {
        try {
            const senderId = socket.data.userId;

            if (!senderId) {
                return socket.emit(
                    "errorMessage",
                    "User is not registered"
                );
            }

            const {
                messageIds,
                conversationId,
                clientMessageId,
            } = data;

            if (
                !Array.isArray(messageIds) ||
                messageIds.length === 0
            ) {
                return socket.emit(
                    "errorMessage",
                    "No messages selected"
                );
            }

            if (!conversationId) {
                return socket.emit(
                    "errorMessage",
                    "Target conversation is required"
                );
            }

            const results = await forwardMessagesService(
                senderId,
                messageIds,
                conversationId,
                clientMessageId
            );

            if (results.length === 0) {
                return socket.emit(
                    "errorMessage",
                    "Failed to forward messages"
                );
            }

            /*
             * Send every newly created forwarded message
             * back to the sender.
             */
            for (const result of results) {
                const payload = toMessagePayload(result.message);

                socket.emit("messageSent", payload);

                /*
                 * Private conversation delivery status
                 */
                if (
                    result.initialStatus === "delivered" &&
                    result.recipientId
                ) {
                    socket.emit("messageDelivered", {
                        conversationId:
                            result.conversation._id.toString(),

                        messageId:
                            result.message._id.toString(),

                        userId: result.recipientId,

                        status: "delivered",
                    });
                }

                /*
                 * Update conversation list
                 */
                const c = result.conversation;

                io.emit("conversationUpdated", {
                    id: c._id.toString(),
                    type: c.type,
                    name: c.name,
                    description: c.description,
                    createdBy: c.createdBy,
                    participants: c.participants,
                    lastMessageId:
                        c.lastMessageId?.toString(),
                    lastMessageAt:
                        c.lastMessageAt?.toISOString(),
                    messageCount: c.messageCount,
                    createdAt:
                        c.createdAt?.toISOString(),
                    updatedAt:
                        c.updatedAt?.toISOString(),
                });
            }

        } catch (error) {
            console.error(
                "MULTIPLE FORWARD ERROR:",
                error
            );

            socket.emit(
                "errorMessage",
                error instanceof Error
                    ? error.message
                    : "Failed to forward messages"
            );
        }
    });

    socket.on(
        "deleteMessages",
        async ({
            messageIds,
            forEveryone,
        }: {
            messageIds: string[];
            forEveryone: boolean;
        }) => {
            try {
                const userId = socket.data.userId;

                if (!userId) {
                    return socket.emit(
                        "errorMessage",
                        "User is not registered"
                    );
                }

                if (
                    !Array.isArray(messageIds) ||
                    messageIds.length === 0
                ) {
                    return socket.emit(
                        "errorMessage",
                        "No messages selected"
                    );
                }

                const results = await deleteMessagesService(
                    userId,
                    messageIds,
                    forEveryone
                );

                if (results.length === 0) {
                    return socket.emit(
                        "errorMessage",
                        "No messages were deleted"
                    );
                }

                /*
                 * Delete for me:
                 * Only the current user's view is updated.
                 */
                if (!forEveryone) {
                    for (const result of results) {
                        socket.emit("messageDeleted", {
                            messageId:
                                result.message._id.toString(),

                            conversationId:
                                result.message.conversationId.toString(),

                            deletedAt:
                                result.deletedAt.toISOString(),

                            forEveryone: false,
                        });
                    }

                    return;
                }

                /*
                 * Delete for everyone:
                 * Notify every participant.
                 */
                for (const result of results) {
                    const payload = {
                        messageId:
                            result.message._id.toString(),

                        conversationId:
                            result.message.conversationId.toString(),

                        deletedAt:
                            result.deletedAt.toISOString(),

                        forEveryone: true,
                    };

                    if (!result.conversation) {
                        continue;
                    }

                    for (const participantId of result.conversation.participants) {
                        const socketId =
                            await getOnlineUser(participantId);

                        if (socketId) {
                            io.to(socketId).emit(
                                "messageDeleted",
                                payload
                            );
                        }
                    }
                }

            } catch (error) {
                console.error(
                    "MULTIPLE DELETE ERROR:",
                    error
                );

                socket.emit(
                    "errorMessage",
                    error instanceof Error
                        ? error.message
                        : "Failed to delete messages"
                );
            }
        }
    );
}

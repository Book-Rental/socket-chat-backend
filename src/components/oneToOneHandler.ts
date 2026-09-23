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

            console.log(
                "User registered:",
                trimmedUserId,
                "Socket:",
                socket.id
            );

            console.log(
                "Online socket:",
                await getOnlineUser(trimmedUserId)
            );

            io.emit("onlineUsers", await getOnlineUsers());

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
                return socket.emit("errorMessage", "User is not registered");
            }

            const result = await sendMessageService(senderId, data);

            if (result.duplicate || !result.messagePayload) {
                return;
            }
            console.log("Message sent:", result.messagePayload);
            const allParticipants = [
                senderId,
                ...result.recipientIds,
            ];

            for (const participantId of allParticipants) {
                const socketId = await getOnlineUser(participantId);

                if (!socketId) {
                    console.log(`User ${participantId} is offline, skipping messageSent event`);
                    continue;
                }
                io.to(socketId).emit(
                    "messageSent",
                    result.messagePayload
                );
            }
            // Notify clients that the conversation list has changed.
            const conversation = result.conversation;

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
            socket.emit(
                "errorMessage",
                error instanceof Error ? error.message : "Failed to send message"
            );
        }
    });
    socket.on("forwardMessage", async (data) => {
        try {
            const senderId = socket.data.userId;

            if (!senderId) {
                return socket.emit("errorMessage", "User is not registered");
            }

            const result = await forwardMessageService(
                senderId,
                data.messageId,
                data.conversationId,
                data.clientMessageId
            );

            if (result.duplicate) {
                // still reconcile the sender's optimistic UI even on a dup
                return socket.emit("messageSent", result.messageData);
            }

            const allParticipants = [senderId, ...result.recipientIds];

            for (const participantId of allParticipants) {
                const socketId = await getOnlineUser(participantId);
                if (!socketId) continue;
                io.to(socketId).emit("messageSent", result.messageData);
            }

            const c = result.conversation;

            io.emit("conversationUpdated", {
                id: c._id.toString(),
                type: c.type,
                name: c.name,
                description: c.description,
                createdBy: c.createdBy,
                participants: c.participants,
                lastMessageId: c.lastMessageId?.toString(),
                lastMessageAt: c.lastMessageAt?.toISOString(),
                messageCount: c.messageCount,
                createdAt: c.createdAt?.toISOString(),
                updatedAt: c.updatedAt?.toISOString(),
            });

        } catch (error) {
            console.error("FORWARD MESSAGE ERROR:", error);
            socket.emit(
                "errorMessage",
                error instanceof Error ? error.message : "Failed to forward message"
            );
        }
    });
    socket.on("editMessage", async ({ messageId, text }) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return socket.emit("errorMessage", "User is not registered");

            const { messagePayload, conversation } = await editMessageService(userId, messageId, text);

            for (const participantId of conversation.participants) {
                const socketId = await getOnlineUser(participantId);
                if (socketId) io.to(socketId).emit("messageEdited", messagePayload);
            }
        } catch (error) {
            console.error("EDIT MESSAGE ERROR:", error);
            socket.emit("errorMessage", error instanceof Error ? error.message : "Failed to edit message");
        }
    });

    socket.on("deleteMessage", async ({ messageId, forEveryone }) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return socket.emit("errorMessage", "User is not registered");

            const result = await deleteMessageService(userId, messageId, forEveryone ?? false);
            if (!result) return;

            const payload = {
                messageId: result.messageId,
                conversationId: result.conversationId,
                deletedAt: result.deletedAt.toISOString(),
                forEveryone: result.forEveryone,
                tempId: result.tempId,          // NEW
                userId,
            };

            if (!result.forEveryone) return socket.emit("messageDeleted", payload);

            for (const participantId of result.conversation!.participants) {
                const socketId = await getOnlineUser(participantId);
                if (socketId) io.to(socketId).emit("messageDeleted", payload);
            }
        } catch (error) {
            console.error("DELETE MESSAGE ERROR:", error);
            socket.emit("errorMessage", error instanceof Error ? error.message : "Failed to delete message");
        }
    });

    socket.on("messageDelivered", async ({ conversationId, messageId }) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return;

            const payload = await markMessageDeliveredService(
                userId, conversationId, messageId
            );
            if (!payload) return;

            const senderSocketId = await getOnlineUser(payload.senderId);
            if (senderSocketId)
                io.to(senderSocketId).emit("messageDelivered", {
                    conversationId, messageId: payload.messageId, userId,
                    tempId: payload.tempId,
                    status: "delivered",
                });
        } catch (error) {
            console.error("MESSAGE DELIVERED ERROR:", error);
        }
    });

    socket.on("messagesRead", async ({ conversationId, messageId }) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return;

            const payload = await markMessagesReadService(
                userId, conversationId, messageId
            );
            if (!payload) return;

            const senderSocketId = await getOnlineUser(payload.senderId);
            if (senderSocketId)
                io.to(senderSocketId).emit("messageRead", {
                    conversationId, messageId: payload.messageId, tempId: payload.tempId,
                    userId, status: "read",
                    upToCreatedAt: payload.upToCreatedAt,
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

    socket.on("forwardMessages", async (data) => {
        try {
            const senderId = socket.data.userId;

            if (!senderId) {
                return socket.emit("errorMessage", "User is not registered");
            }

            const { messageIds, conversationId, clientMessageId } = data;

            if (!Array.isArray(messageIds) || messageIds.length === 0) {
                return socket.emit("errorMessage", "No messages selected");
            }

            if (!conversationId) {
                return socket.emit("errorMessage", "Target conversation is required");
            }

            const results = await forwardMessagesService(
                senderId,
                messageIds,
                conversationId,
                clientMessageId
            );

            if (results.length === 0) {
                return socket.emit("errorMessage", "Failed to forward messages");
            }

            for (const result of results) {
                const { messageData, conversation, duplicate, recipientIds } = result;

                const allParticipants = [senderId, ...recipientIds];

                for (const participantId of allParticipants) {
                    const socketId = await getOnlineUser(participantId);
                    if (!socketId) continue;
                    io.to(socketId).emit("messageSent", messageData);
                }

                if (duplicate) {
                    continue;
                }

                const c = conversation;

                io.emit("conversationUpdated", {
                    id: c._id.toString(),
                    type: c.type,
                    name: c.name,
                    description: c.description,
                    createdBy: c.createdBy,
                    participants: c.participants,
                    lastMessageId: c.lastMessageId?.toString(),
                    lastMessageAt: c.lastMessageAt?.toISOString(),
                    messageCount: c.messageCount,
                    createdAt: c.createdAt?.toISOString(),
                    updatedAt: c.updatedAt?.toISOString(),
                });
            }

        } catch (error) {
            console.error("MULTIPLE FORWARD ERROR:", error);
            socket.emit(
                "errorMessage",
                error instanceof Error ? error.message : "Failed to forward messages"
            );
        }
    });

    socket.on("deleteMessages", async ({ messageIds, forEveryone }: { messageIds: string[]; forEveryone: boolean }) => {
        try {
            const userId = socket.data.userId;
            if (!userId) return socket.emit("errorMessage", "User is not registered");

            if (!Array.isArray(messageIds) || messageIds.length === 0) {
                return socket.emit("errorMessage", "No messages selected");
            }

            const results = await deleteMessagesService(userId, messageIds, forEveryone);

            if (results.length === 0) {
                return socket.emit("errorMessage", "No messages were deleted");
            }

            if (!forEveryone) {
                for (const result of results) {
                    socket.emit("messageDeleted", {
                        messageId: result.messageId,
                        conversationId: result.conversationId,
                        deletedAt: result.deletedAt.toISOString(),
                        forEveryone: false,
                        tempId: result.tempId,
                    });
                }
                return;
            }

            for (const result of results) {
                const payload = {
                    messageId: result.messageId,
                    conversationId: result.conversationId,
                    deletedAt: result.deletedAt.toISOString(),
                    forEveryone: true,
                    userId: result.userId,
                    tempId: result.tempId,
                };

                if (!result.conversation) continue;

                for (const participantId of result.conversation.participants) {
                    const socketId = await getOnlineUser(participantId);
                    if (socketId) io.to(socketId).emit("messageDeleted", payload);
                }
            }
        } catch (error) {
            console.error("MULTIPLE DELETE ERROR:", error);
            socket.emit("errorMessage", error instanceof Error ? error.message : "Failed to delete messages");
        }
    });


    socket.on("callUser", async ({ to, conversationId, offer, callType }) => {
        try {
            const fromUserId = socket.data.userId;
            if (!fromUserId) return;

            const targetSocketId = await getOnlineUser(to);

            if (!targetSocketId) {
                return socket.emit("callUserOffline", { to, conversationId });
            }

            io.to(targetSocketId).emit("incomingCall", {
                from: fromUserId,
                conversationId,
                offer,
                callType,
            });
        } catch (error) {
            console.error("CALL USER ERROR:", error);
        }
    });

    socket.on("answerCall", async ({ to, conversationId, answer }) => {
        try {
            const fromUserId = socket.data.userId;
            if (!fromUserId) return;

            const targetSocketId = await getOnlineUser(to);
            if (!targetSocketId) return;

            io.to(targetSocketId).emit("callAnswered", {
                from: fromUserId,
                conversationId,
                answer,
            });
        } catch (error) {
            console.error("ANSWER CALL ERROR:", error);
        }
    });

    socket.on("iceCandidate", async ({ to, candidate }) => {
        try {
            const fromUserId = socket.data.userId;
            if (!fromUserId) return;

            const targetSocketId = await getOnlineUser(to);
            if (!targetSocketId) return;

            io.to(targetSocketId).emit("iceCandidateReceived", {
                from: fromUserId,
                candidate,
            });
        } catch (error) {
            console.error("ICE CANDIDATE ERROR:", error);
        }
    });

    socket.on("rejectCall", async ({ to, conversationId }) => {
        try {
            const fromUserId = socket.data.userId;
            if (!fromUserId) return;

            const targetSocketId = await getOnlineUser(to);
            if (targetSocketId) {
                io.to(targetSocketId).emit("callRejected", {
                    from: fromUserId,
                    conversationId,
                });
            }
        } catch (error) {
            console.error("REJECT CALL ERROR:", error);
        }
    });

    socket.on("endCall", async ({ to, conversationId }) => {
        try {
            const fromUserId = socket.data.userId;
            if (!fromUserId) return;

            const targetSocketId = await getOnlineUser(to);
            if (targetSocketId) {
                io.to(targetSocketId).emit("callEnded", {
                    from: fromUserId,
                    conversationId,
                });
            }
        } catch (error) {
            console.error("END CALL ERROR:", error);
        }
    });
}

import {
    Server,
    Socket,
} from "socket.io";

import { randomUUID } from "crypto";

import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
    MessagePayload,
} from "../types/types";

import {
    Conversation,
} from "../models/Conversation";

import {
    ConversationParticipant,
} from "../models/ConversationParticipant";

import {
    Message,
} from "../models/Message";

import {
    onlineUsers,
} from "../store";

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

export function registerMessageHandlers(
    io: IOServer,
    socket: IOSocket
): void {

    socket.on(
        "sendMessage",
        async ({
            conversationId,
            content,
            clientMessageId,
            type = "text",
            replyTo,
        }) => {

            const senderId =
                socket.data.userId;

            if (!senderId) {
                socket.emit(
                    "errorMessage",
                    "User is not registered"
                );

                return;
            }

            const trimmedContent =
                content?.trim();

            if (!trimmedContent) {
                socket.emit(
                    "errorMessage",
                    "Message cannot be empty"
                );

                return;
            }

            if (!conversationId) {
                socket.emit(
                    "errorMessage",
                    "Conversation ID is required"
                );

                return;
            }

            if (!clientMessageId) {
                socket.emit(
                    "errorMessage",
                    "Client message ID is required"
                );

                return;
            }

            try {

                const conversation =
                    await Conversation.findById(
                        conversationId
                    );

                if (!conversation) {
                    socket.emit(
                        "errorMessage",
                        "Conversation not found"
                    );

                    return;
                }

                if (
                    !conversation.participants.includes(
                        senderId
                    )
                ) {
                    socket.emit(
                        "errorMessage",
                        "You are not a member of this conversation"
                    );

                    return;
                }

                // Prevent duplicate messages
                const existingMessage =
                    await Message.findOne({
                        conversationId,
                        clientMessageId,
                    });

                if (existingMessage) {

                    socket.emit(
                        "messageSent",
                        toMessagePayload(
                            existingMessage
                        )
                    );

                    return;
                }

                const message =
                    await Message.create({
                        conversationId,
                        senderId,
                        type,
                        content: trimmedContent,
                        clientMessageId,
                        replyTo,
                    });

                await Conversation.findByIdAndUpdate(
                    conversationId,
                    {
                        $set: {
                            lastMessageId:
                                message._id,

                            lastMessageAt:
                                message.createdAt,
                        },

                        $inc: {
                            messageCount: 1,
                        },
                    }
                );

                const payload =
                    toMessagePayload(
                        message
                    );

                // Sender confirmation
                socket.emit(
                    "messageSent",
                    payload
                );

                // Update unread counts
                await ConversationParticipant.updateMany(
                    {
                        conversationId,
                        userId: {
                            $ne: senderId,
                        },
                        leftAt: null,
                    },
                    {
                        $inc: {
                            unreadCount: 1,
                        },
                    }
                );

                // Deliver message to participants
                conversation.participants
                    .filter(
                        userId =>
                            userId !== senderId
                    )
                    .forEach(
                        async userId => {

                            const socketId =
                                onlineUsers.get(
                                    userId
                                );

                            if (!socketId) {
                                return;
                            }

                            io.to(socketId)
                                .emit(
                                    "messageNew",
                                    payload
                                );

                            await ConversationParticipant
                                .updateOne(
                                    {
                                        conversationId,
                                        userId,
                                    },
                                    {
                                        $set: {
                                            lastDeliveredMessageId:
                                                message._id,

                                            lastDeliveredAt:
                                                new Date(),
                                        },
                                    }
                                );

                            io.to(socket.id)
                                .emit(
                                    "messageDelivered",
                                    {
                                        conversationId,
                                        messageId:
                                            message._id.toString(),
                                        userId,
                                    }
                                );
                        }
                    );

            } catch (error) {

                console.error(
                    "SEND MESSAGE ERROR:",
                    error
                );

                socket.emit(
                    "errorMessage",
                    "Failed to send message"
                );
            }
        }
    );

    socket.on(
        "messageDelivered",
        async ({
            conversationId,
            messageId,
        }) => {

            const userId =
                socket.data.userId;

            if (!userId) {
                return;
            }

            try {

                const message =
                    await Message.findOne({
                        _id: messageId,
                        conversationId,
                    });

                if (!message) {
                    return;
                }

                await ConversationParticipant.updateOne(
                    {
                        conversationId,
                        userId,
                    },
                    {
                        $set: {
                            lastDeliveredMessageId:
                                message._id,

                            lastDeliveredAt:
                                new Date(),
                        },
                    }
                );

                const conversation =
                    await Conversation
                        .findById(
                            conversationId
                        )
                        .lean();

                if (!conversation) {
                    return;
                }

                const senderSocketId =
                    onlineUsers.get(
                        message.senderId
                    );

                if (senderSocketId) {

                    io.to(senderSocketId)
                        .emit(
                            "messageDelivered",
                            {
                                conversationId,
                                messageId,
                                userId,
                            }
                        );
                }

            } catch (error) {

                console.error(
                    "MESSAGE DELIVERED ERROR:",
                    error
                );
            }
        }
    );

    socket.on(
        "messagesRead",
        async ({
            conversationId,
            messageId,
        }) => {

            const userId =
                socket.data.userId;

            if (!userId) {
                return;
            }

            try {

                const message =
                    await Message.findOne({
                        _id: messageId,
                        conversationId,
                    });

                if (!message) {
                    return;
                }

                await ConversationParticipant.updateOne(
                    {
                        conversationId,
                        userId,
                    },
                    {
                        $set: {
                            lastReadMessageId:
                                message._id,

                            lastReadAt:
                                new Date(),

                            unreadCount: 0,
                        },
                    }
                );

                const senderSocketId =
                    onlineUsers.get(
                        message.senderId
                    );

                if (senderSocketId) {

                    io.to(senderSocketId)
                        .emit(
                            "messageRead",
                            {
                                conversationId,
                                messageId,
                                userId,
                            }
                        );
                }

                socket.emit(
                    "unreadCountUpdated",
                    {
                        conversationId,
                        count: 0,
                    }
                );

            } catch (error) {

                console.error(
                    "MESSAGE READ ERROR:",
                    error
                );
            }
        }
    );
}

function toMessagePayload(
    message: any
): MessagePayload {

    return {
        id: message._id.toString(),

        conversationId:
            message.conversationId.toString(),

        senderId:
            message.senderId,

        type:
            message.type,

        content:
            message.content,

        clientMessageId:
            message.clientMessageId,

        replyTo:
            message.replyTo?.toString(),

        createdAt:
            message.createdAt.toISOString(),

        updatedAt:
            message.updatedAt.toISOString(),
    };
}
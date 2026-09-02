import {
    Server,
    Socket,
} from "socket.io";

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


export function registerOneToOneHandlers(
    io: IOServer,
    socket: IOSocket
): void {

    // --------------------------------------------------
    // REGISTER USER
    // --------------------------------------------------

    socket.on(
        "registerUser",
        (userId) => {

            const trimmedUserId =
                userId.trim();

            if (!trimmedUserId) {

                socket.emit(
                    "errorMessage",
                    "Invalid username"
                );

                return;
            }

            const previousUserId =
                socket.data.userId;

            if (
                previousUserId &&
                previousUserId !== trimmedUserId
            ) {

                const previousSocketId =
                    onlineUsers.get(
                        previousUserId
                    );

                if (
                    previousSocketId ===
                    socket.id
                ) {

                    onlineUsers.delete(
                        previousUserId
                    );
                }
            }

            socket.data.userId =
                trimmedUserId;

            onlineUsers.set(
                trimmedUserId,
                socket.id
            );

            io.emit(
                "onlineUsers",
                Array.from(
                    onlineUsers.keys()
                )
            );

            socket.broadcast.emit(
                "userOnline",
                trimmedUserId
            );

            console.log(
                `User registered: ${trimmedUserId} -> ${socket.id}`
            );
        }
    );


    // --------------------------------------------------
    // SEND MESSAGE
    // --------------------------------------------------

    socket.on(
        "sendMessage",
        async (data) => {

            try {

                const senderId =
                    socket.data.userId;

                if (!senderId) {

                    socket.emit(
                        "errorMessage",
                        "User is not registered"
                    );

                    return;
                }

                const {
                    conversationId,
                    content,
                    clientMessageId,
                    type = "text",
                    replyTo,
                } = data;


                // Validate conversation ID
                if (!conversationId) {

                    socket.emit(
                        "errorMessage",
                        "Conversation ID is required"
                    );

                    return;
                }


                // Validate content
                if (
                    type === "text" &&
                    !content?.trim()
                ) {

                    socket.emit(
                        "errorMessage",
                        "Message content is required"
                    );

                    return;
                }


                // Find conversation
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


                // Verify sender is participant
                const isParticipant =
                    conversation.participants.includes(
                        senderId
                    );

                if (!isParticipant) {

                    socket.emit(
                        "errorMessage",
                        "You are not a participant in this conversation"
                    );

                    return;
                }


                // Prevent duplicate client messages
                if (clientMessageId) {

                    const existingMessage =
                        await Message.findOne({
                            conversationId,
                            clientMessageId,
                        });

                    if (existingMessage) {

                        const existingPayload:
                            MessagePayload = {
                            id: existingMessage._id.toString(),
                            conversationId:
                                existingMessage.conversationId.toString(),
                            senderId:
                                existingMessage.senderId,
                            type:
                                existingMessage.type,
                            content:
                                existingMessage.content,
                            clientMessageId:
                                existingMessage.clientMessageId,
                            replyTo:
                                existingMessage.replyTo?.toString(),
                            createdAt:
                                existingMessage.createdAt.toISOString(),
                            updatedAt:
                                existingMessage.updatedAt.toISOString(),
                        };

                        socket.emit(
                            "messageSent",
                            existingPayload
                        );

                        return;
                    }
                }


                // Create message
                const message =
                    await Message.create({
                        conversationId,
                        senderId,
                        type,
                        content:
                            content?.trim(),
                        clientMessageId,
                        replyTo,
                    });


                // Update conversation
                conversation.lastMessageId =
                    message._id;

                conversation.lastMessageAt =
                    message.createdAt;

                conversation.messageCount += 1;

                await conversation.save();


                // Update unread count for other participants
                const otherParticipants =
                    conversation.participants.filter(
                        participant =>
                            participant !== senderId
                    );


                for (
                    const participantId
                    of otherParticipants
                ) {

                    await ConversationParticipant.updateOne(
                        {
                            conversationId:
                                conversation._id,
                            userId:
                                participantId,
                            leftAt: {
                                $exists: false,
                            },
                        },
                        {
                            $inc: {
                                unreadCount: 1,
                            },
                        }
                    );
                }


                // Create response payload
                const payload:
                    MessagePayload = {

                    id:
                        message._id.toString(),

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


                // Send confirmation to sender
                socket.emit(
                    "messageSent",
                    payload
                );


                // Send message to other participants
                for (
                    const participantId
                    of otherParticipants
                ) {

                    const socketId =
                        onlineUsers.get(
                            participantId
                        );

                    if (socketId) {

                        io.to(socketId).emit(
                            "messageNew",
                            payload
                        );

                        const participant =
                            await ConversationParticipant.findOne({
                                conversationId:
                                    conversation._id,
                                userId:
                                    participantId,
                            }).lean();

                        io.to(socketId).emit(
                            "unreadCountUpdated",
                            {
                                conversationId:
                                    conversation._id.toString(),
                                count:
                                    participant?.unreadCount ??
                                    0,
                            }
                        );
                    }
                }


                // Notify conversation update
                io.emit(
                    "conversationUpdated",
                    {
                        id:
                            conversation._id.toString(),

                        type:
                            conversation.type,

                        name:
                            conversation.name,

                        description:
                            conversation.description,

                        createdBy:
                            conversation.createdBy,

                        participants:
                            conversation.participants,

                        lastMessageId:
                            conversation.lastMessageId?.toString(),

                        lastMessageAt:
                            conversation.lastMessageAt?.toISOString(),

                        messageCount:
                            conversation.messageCount,

                        createdAt:
                            conversation.createdAt?.toISOString(),

                        updatedAt:
                            conversation.updatedAt?.toISOString(),
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


    // --------------------------------------------------
    // MESSAGE DELIVERED
    // --------------------------------------------------

    socket.on(
        "messageDelivered",
        async ({
            conversationId,
            messageId,
        }) => {

            try {

                const userId =
                    socket.data.userId;

                if (!userId) {
                    return;
                }

                const participant =
                    await ConversationParticipant.findOne({
                        conversationId,
                        userId,
                    });

                if (!participant) {
                    return;
                }

                participant.lastDeliveredMessageId =
                    messageId as any;

                participant.lastDeliveredAt =
                    new Date();

                await participant.save();


                // Notify sender
                const message =
                    await Message.findById(
                        messageId
                    ).lean();

                if (!message) {
                    return;
                }

                const senderSocketId =
                    onlineUsers.get(
                        message.senderId
                    );

                if (senderSocketId) {

                    io.to(
                        senderSocketId
                    ).emit(
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


    // --------------------------------------------------
    // MESSAGES READ
    // --------------------------------------------------

    socket.on(
        "messagesRead",
        async ({
            conversationId,
            messageId,
        }) => {

            try {

                const userId =
                    socket.data.userId;

                if (!userId) {
                    return;
                }


                const participant =
                    await ConversationParticipant.findOne({
                        conversationId,
                        userId,
                    });

                if (!participant) {
                    return;
                }


                participant.lastReadMessageId =
                    messageId as any;

                participant.lastReadAt =
                    new Date();

                participant.unreadCount = 0;

                await participant.save();


                // Find message
                const message =
                    await Message.findById(
                        messageId
                    ).lean();

                if (!message) {
                    return;
                }


                // Notify sender
                const senderSocketId =
                    onlineUsers.get(
                        message.senderId
                    );

                if (senderSocketId) {

                    io.to(
                        senderSocketId
                    ).emit(
                        "messageRead",
                        {
                            conversationId,
                            messageId,
                            userId,
                        }
                    );
                }


                // Update reader's unread count
                socket.emit(
                    "unreadCountUpdated",
                    {
                        conversationId,
                        count: 0,
                    }
                );

            } catch (error) {

                console.error(
                    "MESSAGES READ ERROR:",
                    error
                );
            }
        }
    );


    // --------------------------------------------------
    // TYPING STARTED
    // --------------------------------------------------

    socket.on(
        "typingStarted",
        async ({
            conversationId,
        }) => {

            try {

                const userId =
                    socket.data.userId;

                if (!userId) {
                    return;
                }

                const conversation =
                    await Conversation.findById(
                        conversationId
                    ).lean();

                if (!conversation) {
                    return;
                }

                conversation.participants
                    .filter(
                        participant =>
                            participant !== userId
                    )
                    .forEach(
                        participant => {

                            const socketId =
                                onlineUsers.get(
                                    participant
                                );

                            if (socketId) {

                                io.to(socketId)
                                    .emit(
                                        "typingStarted",
                                        {
                                            conversationId,
                                            userId,
                                        }
                                    );
                            }
                        }
                    );

            } catch (error) {

                console.error(
                    "TYPING STARTED ERROR:",
                    error
                );
            }
        }
    );


    // --------------------------------------------------
    // TYPING STOPPED
    // --------------------------------------------------

    socket.on(
        "typingStopped",
        async ({
            conversationId,
        }) => {

            try {

                const userId =
                    socket.data.userId;

                if (!userId) {
                    return;
                }

                const conversation =
                    await Conversation.findById(
                        conversationId
                    ).lean();

                if (!conversation) {
                    return;
                }

                conversation.participants
                    .filter(
                        participant =>
                            participant !== userId
                    )
                    .forEach(
                        participant => {

                            const socketId =
                                onlineUsers.get(
                                    participant
                                );

                            if (socketId) {

                                io.to(socketId)
                                    .emit(
                                        "typingStopped",
                                        {
                                            conversationId,
                                            userId,
                                        }
                                    );
                            }
                        }
                    );

            } catch (error) {

                console.error(
                    "TYPING STOPPED ERROR:",
                    error
                );
            }
        }
    );


    // --------------------------------------------------
    // DISCONNECT
    // --------------------------------------------------

    socket.on(
        "disconnect",
        () => {

            const userId =
                socket.data.userId;

            if (!userId) {
                return;
            }

            const currentSocketId =
                onlineUsers.get(userId);

            if (
                currentSocketId ===
                socket.id
            ) {

                onlineUsers.delete(
                    userId
                );

                io.emit(
                    "onlineUsers",
                    Array.from(
                        onlineUsers.keys()
                    )
                );

                socket.broadcast.emit(
                    "userOffline",
                    userId
                );

                console.log(
                    `User disconnected: ${userId}`
                );
            }
        }
    );
}

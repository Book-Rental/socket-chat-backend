import {
    Server,
    Socket,
} from "socket.io";

import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
} from "../types/types";

import {
    Conversation,
} from "../models/Conversation";

import {
    Message,
} from "../models/Message";

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

export function registerBroadcastHandlers(
    io: IOServer,
    socket: IOSocket
): void {

    socket.on(
        "broadcastMessage",
        async (content) => {

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

            try {

                let conversation =
                    await Conversation.findOne({
                        type: "broadcast",
                        conversationKey:
                            "global-broadcast",
                    });

                if (!conversation) {

                    conversation =
                        await Conversation.create({
                            type: "broadcast",

                            conversationKey:
                                "global-broadcast",

                            participants: [],

                            createdBy:
                                senderId,

                            messageCount: 0,
                        });
                }

                const message =
                    await Message.create({
                        conversationId:
                            conversation._id,

                        senderId,

                        type: "text",

                        content:
                            trimmedContent,
                    });

                await Conversation.findByIdAndUpdate(
                    conversation._id,
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

                const payload = {
                    id:
                        message._id.toString(),

                    conversationId:
                        conversation._id.toString(),

                    senderId,

                    type:
                        message.type,

                    content:
                        message.content,

                    createdAt:
                        message.createdAt.toISOString(),

                    updatedAt:
                        message.updatedAt.toISOString(),
                };

                // Everyone except sender
                socket.broadcast.emit(
                    "receiveBroadcastMessage",
                    payload
                );

                // Sender also gets confirmation
                socket.emit(
                    "messageSent",
                    payload
                );

            } catch (error) {

                console.error(
                    "BROADCAST ERROR:",
                    error
                );

                socket.emit(
                    "errorMessage",
                    "Failed to send broadcast message"
                );
            }
        }
    );
}
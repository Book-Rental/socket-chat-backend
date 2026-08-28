import { Server, Socket } from "socket.io";
import { randomUUID } from "crypto";

import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
    MessagePayload,
} from "../types/types";

import { onlineUsers } from "../store";
import { Message } from "../models/Message";

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

export function registerGroupHandlers(
    io: IOServer,
    socket: IOSocket
): void {
    socket.on(
        "sendGroupMessage",
        async ({ recipients, content }) => {
            const from = socket.data.userId;

            if (!from) {
                socket.emit(
                    "errorMessage",
                    "User is not registered"
                );
                return;
            }

            if (!recipients || recipients.length === 0) {
                socket.emit(
                    "errorMessage",
                    "Select at least one recipient"
                );
                return;
            }

            const trimmedContent = content?.trim();

            if (!trimmedContent) {
                socket.emit(
                    "errorMessage",
                    "Message cannot be empty"
                );
                return;
            }

            const uniqueRecipients = [
                ...new Set(
                    recipients.filter(
                        (userId) => userId !== from
                    )
                ),
            ];

            if (uniqueRecipients.length === 0) {
                socket.emit(
                    "errorMessage",
                    "You cannot send a group message only to yourself"
                );
                return;
            }

            const payload: MessagePayload = {
                id: randomUUID(),
                from,
                recipients: uniqueRecipients,
                content: trimmedContent,
                timestamp: Date.now(),
                type: "group",
            };

            try {
                await Message.create({
                    from: payload.from,
                    recipients: payload.recipients,
                    content: payload.content,
                    timestamp: payload.timestamp,
                    type: "group",
                });

                uniqueRecipients.forEach((userId) => {
                    const recipientSocketId =
                        onlineUsers.get(userId);

                    if (recipientSocketId) {
                        io.to(recipientSocketId).emit(
                            "receiveGroupMessage",
                            payload
                        );
                    }
                });

                socket.emit(
                    "receiveGroupMessage",
                    payload
                );

                console.log(
                    "GROUP MESSAGE SENT:",
                    payload
                );
            } catch (error) {
                console.error(
                    "FAILED TO SAVE GROUP MESSAGE:",
                    error
                );

                socket.emit(
                    "errorMessage",
                    "Failed to send group message"
                );
            }
        }
    );
}
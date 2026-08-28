import { Server, Socket } from "socket.io";
import { randomUUID } from "crypto";

import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
    MessagePayload,
} from "../types/types";
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

export function registerBroadcastHandlers(
    io: IOServer,
    socket: IOSocket
): void {
    socket.on("broadcastMessage", async (content) => {
        const from = socket.data.userId;

        if (!from) {
            socket.emit("errorMessage", "User is not registered");
            return;
        }

        const trimmedContent = content?.trim();

        if (!trimmedContent) {
            socket.emit("errorMessage", "Message cannot be empty");
            return;
        }

        const payload: MessagePayload = {
            id: randomUUID(),
            from,
            content: trimmedContent,
            timestamp: Date.now(),
            type: "broadcast",
        };

        try {
            await Message.create({
                from: payload.from,
                content: payload.content,
                timestamp: payload.timestamp,
                type: "broadcast",
            });

            console.log("BROADCAST MESSAGE SAVED:", payload);

            // Send to everyone except sender
            socket.broadcast.emit(
                "receiveBroadcastMessage",
                payload
            );

            console.log("BROADCAST MESSAGE SENT:", payload);
        } catch (error) {
            console.error(
                "FAILED TO SAVE BROADCAST MESSAGE:",
                error
            );

            socket.emit(
                "errorMessage",
                "Failed to send broadcast message"
            );
        }
    });
}

import { Server, Socket } from "socket.io";
import { randomUUID } from "crypto";

import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
    MessagePayload
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

export function registerOneToOneHandlers(
    io: IOServer,
    socket: IOSocket
): void {
    socket.on("registerUser", (userId) => {
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

        console.log(
            `User registered: ${trimmedUserId} -> ${socket.id}`
        );

        console.log(
            "CURRENT ONLINE USERS:",
            Array.from(onlineUsers.entries())
        );

        io.emit(
            "onlineUsers",
            Array.from(onlineUsers.keys())
        );

        socket.broadcast.emit(
            "userOnline",
            trimmedUserId
        );
    });

    socket.on("sendPrivateMessage", async ({ to, content }) => {
        const from = socket.data.userId;

        if (!from) {
            socket.emit(
                "errorMessage",
                "User is not registered"
            );
            return;
        }

        if (!to || !content?.trim()) {
            socket.emit(
                "errorMessage",
                "Invalid message"
            );
            return;
        }

        if (from === to) {
            socket.emit(
                "errorMessage",
                "You cannot send a private message to yourself"
            );
            return;
        }

        const recipientSocketId = onlineUsers.get(to);

        if (!recipientSocketId) {
            socket.emit(
                "errorMessage",
                `${to} is offline`
            );
            return;
        }

        const payload: MessagePayload = {
            id: randomUUID(),
            from,
            to,
            content: content.trim(),
            timestamp: Date.now(),
            type: "private",
        };

        try {
            await Message.create({
                from: payload.from,
                to: payload.to,
                content: payload.content,
                timestamp: payload.timestamp,
                type: "private",
            });

            io.to(recipientSocketId).emit(
                "receivePrivateMessage",
                payload
            );

            socket.emit(
                "receivePrivateMessage",
                payload
            );

            console.log(
                "PRIVATE MESSAGE SENT:",
                payload
            );
        } catch (error) {
            console.error(
                "FAILED TO SAVE MESSAGE:",
                error
            );

            socket.emit(
                "errorMessage",
                "Failed to send message"
            );
        }
    });

    socket.on("typing", ({ to }) => {
        const from = socket.data.userId;

        if (!from) return;

        const recipientSocketId = onlineUsers.get(to);

        if (recipientSocketId) {
            io.to(recipientSocketId).emit(
                "typing",
                from
            );
        }
    });

    socket.on("stopTyping", ({ to }) => {
        const from = socket.data.userId;

        if (!from) return;

        const recipientSocketId = onlineUsers.get(to);

        if (recipientSocketId) {
            io.to(recipientSocketId).emit(
                "stopTyping",
                from
            );
        }
    });

    socket.on("disconnect", () => {
        const userId = socket.data.userId;

        if (!userId) return;

        const currentSocketId = onlineUsers.get(userId);

        if (currentSocketId === socket.id) {
            onlineUsers.delete(userId);

            console.log(
                `User disconnected: ${userId}`
            );
        } else {
            console.log(
                `Ignoring disconnect for old socket: ${userId}`
            );
        }

        io.emit(
            "onlineUsers",
            Array.from(onlineUsers.keys())
        );

        socket.broadcast.emit(
            "userOffline",
            userId
        );
    });
}
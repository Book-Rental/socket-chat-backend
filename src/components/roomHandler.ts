import { Server, Socket } from "socket.io";
import { randomUUID } from "crypto";
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData, MessagePayload } from "../types/types";
import { Message } from "../models/Message";
import { Room } from "../models/Room";

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


export function registerRoomHandlers(
    io: IOServer,
    socket: IOSocket
): void {
    socket.on("createRoom", async (roomId) => {
        const normalizedRoomId = roomId.trim();
        const userId = socket.data.userId;

        if (!userId) {
            socket.emit("errorMessage", "User is not registered");
            return;
        }

        if (!normalizedRoomId) {
            socket.emit("errorMessage", "Room name is required");
            return;
        }

        try {
            const existingRoom = await Room.findOne({ roomId: normalizedRoomId });

            if (existingRoom) {
                socket.emit(
                    "errorMessage",
                    `Room "${normalizedRoomId}" already exists — try joining it instead`
                );
                return;
            }

            await Room.create({
                roomId: normalizedRoomId,
                createdBy: userId,
            });

            socket.join(normalizedRoomId);

            console.log(
                `${userId} created room ${normalizedRoomId}`
            );

            socket.emit("roomCreated", normalizedRoomId);

            sendRoomUsers(io, normalizedRoomId);
        } catch (error) {
            console.error("FAILED TO CREATE ROOM:", error);
            socket.emit("errorMessage", "Failed to create room");
        }
    });

    socket.on("joinRoom", async (roomId) => {
        const normalizedRoomId = roomId.trim();
        const userId = socket.data.userId;

        if (!userId) {
            socket.emit("errorMessage", "User is not registered");
            return;
        }

        if (!normalizedRoomId) {
            socket.emit("errorMessage", "Room name is required");
            return;
        }

        if (socket.rooms.has(normalizedRoomId)) {
            socket.emit(
                "errorMessage",
                `You are already in room "${normalizedRoomId}"`
            );
            return;
        }

        try {
            const existingRoom = await Room.findOne({ roomId: normalizedRoomId });

            if (!existingRoom) {
                socket.emit(
                    "errorMessage",
                    `Room "${normalizedRoomId}" does not exist`
                );
                return;
            }

            socket.join(normalizedRoomId);

            console.log(
                `${userId} joined room ${normalizedRoomId}`
            );

            socket.emit("roomJoined", normalizedRoomId);

            io.to(normalizedRoomId).emit(
                "roomNotification",
                `${userId} joined the room`
            );

            sendRoomUsers(io, normalizedRoomId);
        } catch (error) {
            console.error("FAILED TO JOIN ROOM:", error);
            socket.emit("errorMessage", "Failed to join room");
        }
    });

    socket.on("leaveRoom", (roomId) => {
        const normalizedRoomId = roomId.trim();
        const userId = socket.data.userId;

        if (!userId || !normalizedRoomId) return;

        if (!socket.rooms.has(normalizedRoomId)) {
            socket.emit(
                "errorMessage",
                "You are not a member of this room"
            );
            return;
        }

        socket.leave(normalizedRoomId);

        console.log(
            `${userId} left room ${normalizedRoomId}`
        );

        socket.emit("roomLeft", normalizedRoomId);

        io.to(normalizedRoomId).emit(
            "roomNotification",
            `${userId} left the room`
        );

        sendRoomUsers(io, normalizedRoomId);
    });

    socket.on(
        "sendRoomMessage",
        async ({ roomId, content }) => {
            const normalizedRoomId = roomId.trim();
            const trimmedContent = content.trim();
            const from = socket.data.userId;

            if (!from) {
                socket.emit(
                    "errorMessage",
                    "User is not registered"
                );
                return;
            }

            if (!normalizedRoomId) {
                socket.emit(
                    "errorMessage",
                    "Room ID is required"
                );
                return;
            }

            if (!trimmedContent) {
                socket.emit(
                    "errorMessage",
                    "Message cannot be empty"
                );
                return;
            }

            if (!socket.rooms.has(normalizedRoomId)) {
                socket.emit(
                    "errorMessage",
                    "You are not a member of this room"
                );
                return;
            }

            const payload: MessagePayload = {
                id: randomUUID(),
                from,
                roomId: normalizedRoomId,
                content: trimmedContent,
                timestamp: Date.now(),
                type: "room",
            };

            try {
                await Message.create({
                    from: payload.from,
                    roomId: payload.roomId,
                    content: payload.content,
                    timestamp: payload.timestamp,
                    type: "room",
                });

                io.to(normalizedRoomId).emit(
                    "receiveRoomMessage",
                    payload
                );

                console.log(
                    "ROOM MESSAGE SAVED:",
                    payload
                );
            } catch (error) {
                console.error(
                    "FAILED TO SAVE ROOM MESSAGE:",
                    error
                );

                socket.emit(
                    "errorMessage",
                    "Failed to send room message"
                );
            }
        }
    );

    socket.on("disconnect", () => {
        const joinedRooms = Array.from(socket.rooms).filter(
            (roomId) => roomId !== socket.id
        );

        setTimeout(() => {
            joinedRooms.forEach((roomId) => {
                sendRoomUsers(io, roomId);
            });
        }, 0);
    });
}

function sendRoomUsers(
    io: IOServer,
    roomId: string
): void {
    const room = io.sockets.adapter.rooms.get(roomId);

    if (!room) return;

    const users: string[] = [];

    room.forEach((socketId) => {
        const roomSocket = io.sockets.sockets.get(socketId);
        const userId = roomSocket?.data.userId;

        if (userId) {
            users.push(userId);
        }
    });

    io.to(roomId).emit(
        "roomUsers",
        {
            roomId,
            users,
        }
    );
}
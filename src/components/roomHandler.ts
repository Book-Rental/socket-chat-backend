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
    Room,
} from "../models/Room";

import {
    Conversation,
} from "../models/Conversation";

import {
    ConversationParticipant,
} from "../models/ConversationParticipant";

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

    socket.on(
        "createRoom",
        async (roomId) => {

            const userId =
                socket.data.userId;

            const normalizedRoomId =
                roomId?.trim();

            if (!userId) {
                socket.emit(
                    "errorMessage",
                    "User is not registered"
                );

                return;
            }

            if (!normalizedRoomId) {
                socket.emit(
                    "errorMessage",
                    "Room name is required"
                );

                return;
            }

            try {

                const existingRoom =
                    await Room.findOne({
                        roomId:
                            normalizedRoomId,
                    });

                if (existingRoom) {
                    socket.emit(
                        "errorMessage",
                        "Room already exists"
                    );

                    return;
                }

                const room =
                    await Room.create({
                        roomId:
                            normalizedRoomId,

                        createdBy:
                            userId,
                    });

                const conversation =
                    await Conversation.create({
                        type: "room",

                        conversationKey:
                            `room:${room._id}`,

                        name:
                            normalizedRoomId,

                        createdBy:
                            userId,

                        participants: [
                            userId,
                        ],

                        messageCount: 0,
                    });

                await ConversationParticipant.create({
                    conversationId:
                        conversation._id,

                    userId,

                    role: "owner",

                    unreadCount: 0,
                });

                socket.join(
                    normalizedRoomId
                );

                socket.emit(
                    "roomCreated",
                    normalizedRoomId
                );

                console.log(
                    `Room created: ${normalizedRoomId}`
                );

            } catch (error) {

                console.error(
                    "CREATE ROOM ERROR:",
                    error
                );

                socket.emit(
                    "errorMessage",
                    "Failed to create room"
                );
            }
        }
    );

    socket.on(
        "joinRoom",
        async (roomId) => {

            const userId =
                socket.data.userId;

            const normalizedRoomId =
                roomId?.trim();

            if (!userId) {
                socket.emit(
                    "errorMessage",
                    "User is not registered"
                );

                return;
            }

            if (!normalizedRoomId) {
                return;
            }

            try {

                const room =
                    await Room.findOne({
                        roomId:
                            normalizedRoomId,
                    });

                if (!room) {
                    socket.emit(
                        "errorMessage",
                        "Room does not exist"
                    );

                    return;
                }

                const conversation =
                    await Conversation.findOne({
                        type: "room",

                        conversationKey:
                            `room:${room._id}`,
                    });

                if (!conversation) {
                    socket.emit(
                        "errorMessage",
                        "Room conversation not found"
                    );

                    return;
                }

                await ConversationParticipant.updateOne(
                    {
                        conversationId:
                            conversation._id,

                        userId,
                    },
                    {
                        $setOnInsert: {
                            role: "member",

                            unreadCount: 0,
                        },
                    },
                    {
                        upsert: true,
                    }
                );

                await Conversation.updateOne(
                    {
                        _id:
                            conversation._id,
                    },
                    {
                        $addToSet: {
                            participants:
                                userId,
                        },
                    }
                );

                socket.join(
                    normalizedRoomId
                );

                socket.emit(
                    "roomJoined",
                    normalizedRoomId
                );

                io.to(normalizedRoomId)
                    .emit(
                        "roomNotification",
                        `${userId} joined the room`
                    );

                sendRoomUsers(
                    io,
                    normalizedRoomId
                );

            } catch (error) {

                console.error(
                    "JOIN ROOM ERROR:",
                    error
                );

                socket.emit(
                    "errorMessage",
                    "Failed to join room"
                );
            }
        }
    );

    socket.on(
        "leaveRoom",
        async (roomId) => {

            const userId =
                socket.data.userId;

            const normalizedRoomId =
                roomId?.trim();

            if (!userId || !normalizedRoomId) {
                return;
            }

            try {

                const room =
                    await Room.findOne({
                        roomId:
                            normalizedRoomId,
                    });

                if (!room) {
                    return;
                }

                const conversation =
                    await Conversation.findOne({
                        type: "room",

                        conversationKey:
                            `room:${room._id}`,
                    });

                if (conversation) {

                    await ConversationParticipant.updateOne(
                        {
                            conversationId:
                                conversation._id,

                            userId,
                        },
                        {
                            $set: {
                                leftAt:
                                    new Date(),
                            },
                        }
                    );

                    await Conversation.updateOne(
                        {
                            _id:
                                conversation._id,
                        },
                        {
                            $pull: {
                                participants:
                                    userId,
                            },
                        }
                    );
                }

                socket.leave(
                    normalizedRoomId
                );

                socket.emit(
                    "roomLeft",
                    normalizedRoomId
                );

                io.to(normalizedRoomId)
                    .emit(
                        "roomNotification",
                        `${userId} left the room`
                    );

                sendRoomUsers(
                    io,
                    normalizedRoomId
                );

            } catch (error) {

                console.error(
                    "LEAVE ROOM ERROR:",
                    error
                );
            }
        }
    );

    socket.on(
        "disconnect",
        () => {

            const joinedRooms =
                Array.from(
                    socket.rooms
                ).filter(
                    roomId =>
                        roomId !== socket.id
                );

            setTimeout(
                () => {
                    joinedRooms.forEach(
                        roomId =>
                            sendRoomUsers(
                                io,
                                roomId
                            )
                    );
                },
                0
            );
        }
    );
}

function sendRoomUsers(
    io: IOServer,
    roomId: string
): void {

    const room =
        io.sockets.adapter.rooms.get(
            roomId
        );

    if (!room) {
        return;
    }

    const users: string[] = [];

    room.forEach(
        socketId => {

            const roomSocket =
                io.sockets.sockets.get(
                    socketId
                );

            const userId =
                roomSocket?.data.userId;

            if (userId) {
                users.push(userId);
            }
        }
    );

    io.to(roomId).emit(
        "roomUsers",
        {
            roomId,
            users,
        }
    );
}
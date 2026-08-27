import { Server, Socket } from "socket.io";
import { randomUUID } from "crypto";

import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
    MessagePayload,
} from "../types/types";


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


/*
 * =========================================================
 * ROOM STORAGE
 * =========================================================
 *
 * Socket.IO automatically creates a room when socket.join()
 * is called.
 *
 * But we also need to know which rooms were intentionally
 * created by users.
 *
 * Example:
 *
 * rooms = {
 *     "developers",
 *     "frontend",
 *     "backend"
 * }
 *
 */

const rooms = new Set<string>();


export function registerRoomHandlers(
    io: IOServer,
    socket: IOSocket
): void {


    /*
     * =====================================================
     * CREATE ROOM
     * =====================================================
     */

    socket.on(
        "createRoom",
        (roomId) => {

            const normalizedRoomId =
                roomId.trim();


            /*
             * Check user
             */

            const userId =
                socket.data.userId;


            if (!userId) {

                socket.emit(
                    "errorMessage",
                    "User is not registered"
                );

                return;
            }


            /*
             * Validate room name
             */

            if (!normalizedRoomId) {

                socket.emit(
                    "errorMessage",
                    "Room name is required"
                );

                return;
            }


            /*
             * Check room already exists
             */

            if (
                rooms.has(
                    normalizedRoomId
                )
            ) {

                socket.emit(
                    "errorMessage",
                    `Room "${normalizedRoomId}" already exists`
                );

                return;
            }


            /*
             * Create room in our room list
             */

            rooms.add(
                normalizedRoomId
            );


            /*
             * Add creator to Socket.IO room
             */

            socket.join(
                normalizedRoomId
            );


            console.log(
                `${userId} created room ${normalizedRoomId}`
            );


            /*
             * Tell creator that room was successfully created
             */

            socket.emit(
                "roomCreated",
                normalizedRoomId
            );


            /*
             * Send current room users
             */

            sendRoomUsers(
                io,
                normalizedRoomId
            );
        }
    );


    /*
     * =====================================================
     * JOIN ROOM
     * =====================================================
     */

    socket.on(
        "joinRoom",
        (roomId) => {

            const normalizedRoomId =
                roomId.trim();


            const userId =
                socket.data.userId;


            /*
             * Check user
             */

            if (!userId) {

                socket.emit(
                    "errorMessage",
                    "User is not registered"
                );

                return;
            }


            /*
             * Validate room name
             */

            if (!normalizedRoomId) {

                socket.emit(
                    "errorMessage",
                    "Room name is required"
                );

                return;
            }


            /*
             * Room must exist
             */

            if (
                !rooms.has(
                    normalizedRoomId
                )
            ) {

                socket.emit(
                    "errorMessage",
                    `Room "${normalizedRoomId}" does not exist`
                );

                return;
            }


            /*
             * Check whether already inside
             */

            if (
                socket.rooms.has(
                    normalizedRoomId
                )
            ) {

                socket.emit(
                    "errorMessage",
                    `You are already in room "${normalizedRoomId}"`
                );

                return;
            }


            /*
             * Join Socket.IO room
             */

            socket.join(
                normalizedRoomId
            );


            console.log(
                `${userId} joined room ${normalizedRoomId}`
            );


            /*
             * Tell the joining user
             */

            socket.emit(
                "roomJoined",
                normalizedRoomId
            );


            /*
             * Tell everyone in room
             */

            io.to(
                normalizedRoomId
            ).emit(
                "roomNotification",
                `${userId} joined the room`
            );


            /*
             * Update room users
             */

            sendRoomUsers(
                io,
                normalizedRoomId
            );
        }
    );


    /*
     * =====================================================
     * LEAVE ROOM
     * =====================================================
     */

    socket.on(
        "leaveRoom",
        (roomId) => {

            const normalizedRoomId =
                roomId.trim();


            const userId =
                socket.data.userId;


            if (!userId) {

                return;
            }


            if (!normalizedRoomId) {

                return;
            }


            /*
             * Check whether user is actually
             * inside this room
             */

            if (
                !socket.rooms.has(
                    normalizedRoomId
                )
            ) {

                socket.emit(
                    "errorMessage",
                    "You are not a member of this room"
                );

                return;
            }


            /*
             * Leave room
             */

            socket.leave(
                normalizedRoomId
            );


            console.log(
                `${userId} left room ${normalizedRoomId}`
            );


            /*
             * Tell the user that they left
             */

            socket.emit(
                "roomLeft",
                normalizedRoomId
            );


            /*
             * Notify remaining members
             *
             * IMPORTANT:
             *
             * socket.leave() happened first.
             *
             * Therefore io.to(roomId) does NOT
             * send this notification back to
             * the user who left.
             */

            io.to(
                normalizedRoomId
            ).emit(
                "roomNotification",
                `${userId} left the room`
            );


            /*
             * Update remaining users
             */

            sendRoomUsers(
                io,
                normalizedRoomId
            );
        }
    );


    /*
     * =====================================================
     * SEND ROOM MESSAGE
     * =====================================================
     */

    socket.on(
        "sendRoomMessage",
        ({
            roomId,
            content,
        }) => {

            const normalizedRoomId =
                roomId.trim();


            const trimmedContent =
                content.trim();


            const from =
                socket.data.userId;


            /*
             * Check user
             */

            if (!from) {

                socket.emit(
                    "errorMessage",
                    "User is not registered"
                );

                return;
            }


            /*
             * Validate room
             */

            if (!normalizedRoomId) {

                socket.emit(
                    "errorMessage",
                    "Room ID is required"
                );

                return;
            }


            /*
             * Validate message
             */

            if (!trimmedContent) {

                socket.emit(
                    "errorMessage",
                    "Message cannot be empty"
                );

                return;
            }


            /*
             * Check room exists
             */

            if (
                !rooms.has(
                    normalizedRoomId
                )
            ) {

                socket.emit(
                    "errorMessage",
                    "Room does not exist"
                );

                return;
            }


            /*
             * Check sender is a member
             */

            if (
                !socket.rooms.has(
                    normalizedRoomId
                )
            ) {

                socket.emit(
                    "errorMessage",
                    "You are not a member of this room"
                );

                return;
            }


            /*
             * Create message
             */

            const payload:
                MessagePayload = {

                id:
                    randomUUID(),

                from,

                roomId:
                    normalizedRoomId,

                content:
                    trimmedContent,

                timestamp:
                    Date.now(),
            };


            console.log(
                "ROOM MESSAGE:",
                payload
            );


            /*
             * Send to EVERYONE inside room
             *
             * INCLUDING sender.
             */

            io.to(
                normalizedRoomId
            ).emit(
                "receiveRoomMessage",
                payload
            );
        }
    );


    /*
     * =====================================================
     * DISCONNECT
     * =====================================================
     */

    socket.on(
        "disconnect",
        () => {

            /*
             * socket.rooms contains:
             *
             * socket.id
             * room1
             * room2
             *
             * before Socket.IO finishes cleanup.
             *
             * Save the rooms first.
             */

            const joinedRooms =
                Array.from(
                    socket.rooms
                ).filter(
                    (roomId) =>
                        roomId !== socket.id
                );


            /*
             * After disconnect Socket.IO removes
             * the socket from all rooms.
             *
             * So update users after cleanup.
             */

            setTimeout(
                () => {

                    joinedRooms.forEach(
                        (roomId) => {

                            sendRoomUsers(
                                io,
                                roomId
                            );
                        }
                    );

                },
                0
            );
        }
    );
}


/*
 * =========================================================
 * SEND ROOM USERS
 * =========================================================
 */

function sendRoomUsers(
    io: IOServer,
    roomId: string
): void {

    const room =
        io.sockets.adapter.rooms.get(
            roomId
        );


    /*
     * Room doesn't exist anymore
     */

    if (!room) {

        return;
    }


    const users: string[] = [];


    /*
     * Get every socket inside room
     */

    room.forEach(
        (socketId) => {

            const roomSocket =
                io.sockets.sockets.get(
                    socketId
                );


            const userId =
                roomSocket?.data.userId;


            if (userId) {

                users.push(
                    userId
                );
            }
        }
    );


    /*
     * Send updated users to
     * everyone inside room
     */

    io.to(
        roomId
    ).emit(
        "roomUsers",
        {
            roomId,
            users,
        }
    );
}
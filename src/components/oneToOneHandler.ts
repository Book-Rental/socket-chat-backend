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

    /*
     * REGISTER USER
     */
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


            /*
             * If this socket was previously
             * registered as another user,
             * remove the old mapping.
             */
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
                    previousSocketId === socket.id
                ) {

                    onlineUsers.delete(
                        previousUserId
                    );

                }

            }


            /*
             * Store user on socket
             */
            socket.data.userId =
                trimmedUserId;


            /*
             * Store user -> socket
             */
            onlineUsers.set(
                trimmedUserId,
                socket.id
            );


            console.log(
                `User registered: ${trimmedUserId} -> ${socket.id}`
            );


            console.log(
                "CURRENT ONLINE USERS:",
                Array.from(
                    onlineUsers.entries()
                )
            );


            /*
             * Send complete online list
             * to everyone
             */
            io.emit(
                "onlineUsers",
                Array.from(
                    onlineUsers.keys()
                )
            );


            /*
             * Tell everyone else
             */
            socket.broadcast.emit(
                "userOnline",
                trimmedUserId
            );

        }
    );


    /*
     * ONE-TO-ONE MESSAGE
     */
    socket.on(
        "sendPrivateMessage",
        ({ to, content }) => {

            const from =
                socket.data.userId;


            console.log(
                "PRIVATE MESSAGE REQUEST:",
                {
                    from,
                    to,
                    content,
                    socketId: socket.id,
                }
            );


            /*
             * Sender must be registered
             */
            if (!from) {

                socket.emit(
                    "errorMessage",
                    "User is not registered"
                );

                return;
            }


            /*
             * Validate recipient
             */
            if (
                !to ||
                !content.trim()
            ) {

                socket.emit(
                    "errorMessage",
                    "Invalid message"
                );

                return;
            }


            /*
             * Prevent sending message to yourself
             */
            if (from === to) {

                socket.emit(
                    "errorMessage",
                    "You cannot send a private message to yourself"
                );

                return;
            }


            /*
             * Find recipient socket
             */
            const recipientSocketId =
                onlineUsers.get(to);


            console.log(
                "RECIPIENT LOOKUP:",
                {
                    to,
                    recipientSocketId,
                    onlineUsers:
                        Array.from(
                            onlineUsers.entries()
                        ),
                }
            );


            /*
             * Recipient must be online
             */
            if (!recipientSocketId) {

                socket.emit(
                    "errorMessage",
                    `${to} is offline`
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

                to,

                content:
                    content.trim(),

                timestamp:
                    Date.now(),
            };


            /*
             * Send ONLY to recipient
             */
            io.to(
                recipientSocketId
            ).emit(
                "receivePrivateMessage",
                payload
            );


            /*
             * Send a copy ONLY to sender
             */
            socket.emit(
                "receivePrivateMessage",
                payload
            );


            console.log(
                "PRIVATE MESSAGE SENT:",
                payload
            );

        }
    );


    /*
     * TYPING
     */
    socket.on(
        "typing",
        ({ to }) => {

            const from =
                socket.data.userId;

            if (!from) return;

            const recipientSocketId =
                onlineUsers.get(to);

            if (
                recipientSocketId
            ) {

                io.to(
                    recipientSocketId
                ).emit(
                    "typing",
                    from
                );
            }
        }
    );


    /*
     * STOP TYPING
     */
    socket.on(
        "stopTyping",
        ({ to }) => {

            const from =
                socket.data.userId;

            if (!from) return;

            const recipientSocketId =
                onlineUsers.get(to);

            if (
                recipientSocketId
            ) {

                io.to(
                    recipientSocketId
                ).emit(
                    "stopTyping",
                    from
                );
            }
        }
    );


    /*
     * DISCONNECT
     */
    socket.on(
        "disconnect",
        () => {

            const userId =
                socket.data.userId;


            if (!userId) {

                return;
            }


            /*
             * Only remove the user if this socket
             * is still the socket registered for
             * that user.
             */
            const currentSocketId =
                onlineUsers.get(userId);


            if (
                currentSocketId === socket.id
            ) {

                onlineUsers.delete(
                    userId
                );

                console.log(
                    `User disconnected: ${userId}`
                );

            } else {

                console.log(
                    `Ignoring disconnect for old socket: ${userId}`
                );

            }


            /*
             * Update everyone
             */
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

        }
    );
}
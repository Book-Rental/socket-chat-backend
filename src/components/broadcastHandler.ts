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


export function registerBroadcastHandlers(
    io: IOServer,
    socket: IOSocket
): void {

    socket.on(
        "broadcastMessage",
        (content) => {

            /*
             * Get registered user
             */
            const from = socket.data.userId;

            console.log(
                "BROADCAST REQUEST:",
                {
                    from,
                    content,
                    socketId: socket.id,
                }
            );


            /*
             * Check user registration
             */
            if (!from) {

                socket.emit(
                    "errorMessage",
                    "User is not registered"
                );

                return;
            }


            /*
             * Validate message
             */
            const trimmedContent =
                content.trim();

            if (!trimmedContent) {

                socket.emit(
                    "errorMessage",
                    "Message cannot be empty"
                );

                return;
            }


            /*
             * Create broadcast message
             */
            const payload: MessagePayload = {

                id: randomUUID(),

                from,

                content: trimmedContent,

                timestamp: Date.now(),
            };


            console.log(
                "BROADCASTING TO OTHER USERS:",
                payload
            );


            /*
             * Send to EVERYONE EXCEPT sender
             */
            socket.broadcast.emit(
                "receiveBroadcastMessage",
                payload
            );


            /*
             * Send the message back only to sender
             *
             * This allows the sender to use the
             * same server-generated payload.
             */


        }
    );
}
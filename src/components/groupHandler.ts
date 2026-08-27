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

export function registerGroupHandlers(
    io: IOServer,
    socket: IOSocket
): void {

    socket.on(
        "sendGroupMessage",
        ({ content }) => {

            const from = socket.data.userId;

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
             * Validate message
             */
            const trimmedContent = content.trim();

            if (!trimmedContent) {
                socket.emit(
                    "errorMessage",
                    "Message cannot be empty"
                );

                return;
            }

            /*
             * Create message
             */
            const payload: MessagePayload = {
                id: randomUUID(),
                from,
                content: trimmedContent,
                timestamp: Date.now(),
            };

            /*
             * Broadcast to EVERYONE
             * including the sender.
             */
            io.emit(
                "receiveBroadcastMessage",
                payload
            );

            console.log(
                `${from} broadcasted: ${trimmedContent}`
            );
        }
    );
}
import {
    Server,
    Socket,
} from "socket.io";

import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
    ConversationPayload,
} from "../types/types";

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

export function registerGroupHandlers(
    io: IOServer,
    socket: IOSocket
): void {

    socket.on(
        "createGroup",
        async ({
            name,
            participants,
        }) => {

            const userId =
                socket.data.userId;

            if (!userId) {
                socket.emit(
                    "errorMessage",
                    "User is not registered"
                );

                return;
            }

            const trimmedName =
                name?.trim();

            if (!trimmedName) {
                socket.emit(
                    "errorMessage",
                    "Group name is required"
                );

                return;
            }

            const uniqueParticipants = [
                ...new Set([
                    userId,
                    ...(participants || []),
                ]),
            ];

            if (
                uniqueParticipants.length <
                2
            ) {
                socket.emit(
                    "errorMessage",
                    "A group requires at least two users"
                );

                return;
            }

            try {

                const conversation =
                    await Conversation.create({
                        type: "group",

                        name: trimmedName,

                        createdBy: userId,

                        participants:
                            uniqueParticipants,

                        messageCount: 0,
                    });

                await ConversationParticipant.insertMany(
                    uniqueParticipants.map(
                        participantId => ({
                            conversationId:
                                conversation._id,

                            userId:
                                participantId,

                            role:
                                participantId ===
                                    userId
                                    ? "owner"
                                    : "member",

                            unreadCount: 0,
                        })
                    )
                );

                const payload:
                    ConversationPayload = {
                    id:
                        conversation._id.toString(),

                    type:
                        "group",

                    name:
                        conversation.name,

                    participants:
                        conversation.participants,

                    messageCount:
                        conversation.messageCount,
                };

                socket.emit(
                    "groupCreated",
                    payload
                );

                console.log(
                    "GROUP CREATED:",
                    payload
                );

            } catch (error) {

                console.error(
                    "CREATE GROUP ERROR:",
                    error
                );

                socket.emit(
                    "errorMessage",
                    "Failed to create group"
                );
            }
        }
    );
}
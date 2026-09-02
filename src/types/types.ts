export type ConversationType =
    | "private"
    | "group"
    | "broadcast"
    | "room";

export type MessageType =
    | "text"
    | "image"
    | "file"
    | "audio"
    | "video"
    | "system";

export type ParticipantRole =
    | "owner"
    | "admin"
    | "member";

export interface MessagePayload {
    id: string;
    conversationId: string;
    senderId: string;
    type: MessageType;
    content?: string;
    clientMessageId?: string;
    replyTo?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ConversationPayload {
    id: string;
    type: ConversationType;
    name?: string;
    description?: string;
    createdBy?: string;
    participants: string[];
    lastMessageId?: string;
    lastMessageAt?: string;
    messageCount: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface ClientToServerEvents {
    registerUser: (
        userId: string
    ) => void;

    sendMessage: (
        data: {
            conversationId: string;
            content?: string;
            clientMessageId: string;
            type?: MessageType;
            replyTo?: string;
        }
    ) => void;

    messageDelivered: (
        data: {
            conversationId: string;
            messageId: string;
        }
    ) => void;

    messagesRead: (
        data: {
            conversationId: string;
            messageId: string;
        }
    ) => void;

    typingStarted: (
        data: {
            conversationId: string;
        }
    ) => void;

    typingStopped: (
        data: {
            conversationId: string;
        }
    ) => void;

    createGroup: (
        data: {
            name: string;
            participants: string[];
        }
    ) => void;

    createRoom: (
        roomId: string
    ) => void;

    joinRoom: (
        roomId: string
    ) => void;

    leaveRoom: (
        roomId: string
    ) => void;

    broadcastMessage: (
        content: string
    ) => void;
}

export interface ServerToClientEvents {
    messageSent: (
        message: MessagePayload
    ) => void;

    messageNew: (
        message: MessagePayload
    ) => void;

    messageDelivered: (
        data: {
            conversationId: string;
            messageId: string;
            userId: string;
        }
    ) => void;

    messageRead: (
        data: {
            conversationId: string;
            messageId: string;
            userId: string;
        }
    ) => void;

    unreadCountUpdated: (
        data: {
            conversationId: string;
            count: number;
        }
    ) => void;

    conversationUpdated: (
        conversation: ConversationPayload
    ) => void;

    groupCreated: (
        conversation: ConversationPayload
    ) => void;

    userOnline: (
        userId: string
    ) => void;

    userOffline: (
        userId: string
    ) => void;

    onlineUsers: (
        users: string[]
    ) => void;

    typingStarted: (
        data: {
            conversationId: string;
            userId: string;
        }
    ) => void;

    typingStopped: (
        data: {
            conversationId: string;
            userId: string;
        }
    ) => void;

    receiveBroadcastMessage: (
        message: MessagePayload
    ) => void;

    receiveRoomMessage: (
        message: MessagePayload
    ) => void;

    receiveGroupMessage: (
        message: MessagePayload
    ) => void;

    roomCreated: (
        roomId: string
    ) => void;

    roomJoined: (
        roomId: string
    ) => void;

    roomLeft: (
        roomId: string
    ) => void;

    roomUsers: (
        data: {
            roomId: string;
            users: string[];
        }
    ) => void;

    roomNotification: (
        message: string
    ) => void;

    errorMessage: (
        message: string
    ) => void;
}

export interface InterServerEvents { }

export interface SocketData {
    userId?: string;
}

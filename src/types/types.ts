export interface MessagePayload {
    id: string;
    from: string;
    to?: string;
    roomId?: string;
    content: string;
    timestamp: number;
}

export interface ClientToServerEvents {
    registerUser: (userId: string) => void;

    sendPrivateMessage: (data: {
        to: string;
        content: string;
    }) => void;

    typing: (data: {
        to: string;
    }) => void;

    stopTyping: (data: {
        to: string;
    }) => void;

    broadcastMessage: (content: string) => void;

    createRoom: (roomId: string) => void;

    joinRoom: (roomId: string) => void;

    leaveRoom: (roomId: string) => void;

    sendRoomMessage: (data: {
        roomId: string;
        content: string;
    }) => void;

    sendGroupMessage: (data: {
        recipients: string[];
        content: string;
    }) => void;
}

export interface ServerToClientEvents {
    receivePrivateMessage: (
        message: MessagePayload
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

    userOnline: (
        userId: string
    ) => void;

    userOffline: (
        userId: string
    ) => void;

    onlineUsers: (
        users: string[]
    ) => void;

    typing: (
        userId: string
    ) => void;

    stopTyping: (
        userId: string
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
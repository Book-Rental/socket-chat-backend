import { IMessageContent, MessageType, MessageStatus } from "../models/Message";

export type ConversationType = "private" | "group" | "broadcast" | "room";
export type ParticipantRole = "owner" | "admin" | "member";

export interface MessagePayload {
    id?: string;
    tempId: string;
    conversationId: string;
    senderId: string;
    type: MessageType;
    content?: IMessageContent;
    clientMessageId?: string;
    replyTo?: ReplyToPayload;
    status: MessageStatus;
    forwarded?: boolean;
    forwardCount?: number;
    editedAt?: string;
    deletedAt?: string;
    deletedForEveryone?: boolean;
    deletedForMe?: boolean;
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
    registerUser: (userId: string) => void;

    sendMessage: (data: SendMessageData) => void;

    editMessage: (data: { messageId: string; text: string }) => void;
    forwardMessage: (data: {
        messageId: string;
        conversationId: string;
        clientMessageId: string;
    }) => void;
    forwardMessages: (data: {
        messageIds: string[];
        conversationId: string;
        clientMessageId: string;
    }) => void;

    deleteMessage: (data: {
        messageId: string;
        forEveryone?: boolean;
    }) => void;
    deleteMessages: (data: {
        messageIds: string[];
        forEveryone: boolean;
    }) => void;
    reactToMessage: (data: { messageId: string; emoji: string }) => void;

    messageDelivered: (data: { conversationId: string; messageId: string }) => void;

    messagesRead: (data: { conversationId: string; messageId: string }) => void;

    typingStarted: (data: { conversationId: string }) => void;
    typingStopped: (data: { conversationId: string }) => void;

    createGroup: (data: { name: string; participants: string[] }) => void;
    createRoom: (roomId: string) => void;
    joinRoom: (roomId: string) => void;
    leaveRoom: (roomId: string) => void;
    broadcastMessage: (content: IMessageContent) => void;


    callUser: (data: {
        to: string;
        conversationId: string;
        offer: RTCSessionDescriptionInit;
        callType: "audio" | "video";
        callId: string;   // NEW
    }) => void;

    answerCall: (data: {
        to: string;
        conversationId: string;
        answer: RTCSessionDescriptionInit;
        callId: string;   // NEW
    }) => void;

    iceCandidate: (data: {
        to: string;
        candidate: RTCIceCandidateInit;
        callId: string;   // NEW
    }) => void;

    rejectCall: (data: { to: string; conversationId: string; callId: string }) => void;

    endCall: (data: { to: string; conversationId: string; callId: string }) => void;
}

export interface ServerToClientEvents {
    messageSent: (message: MessagePayload) => void;
    messageNew: (message: MessagePayload) => void;

    messageDelivered: (data: {
        conversationId: string;
        messageId: string;
        userId: string;
        tempId?: string;
        status: MessageStatus;
    }) => void;

    messageRead: (data: {
        conversationId: string;
        messageId: string;
        userId: string;
        tempId?: string;
        status: MessageStatus;
        upToCreatedAt?: string;
    }) => void;

    messageEdited: (message: MessagePayload) => void;

    messageDeleted: (data: {
        messageId: string;
        conversationId: string;
        deletedAt: string;
        forEveryone: boolean;
        tempId?: string;
    }) => void;

    messageReaction: (data: {
        messageId: string;
        conversationId: string;
        userId: string;
        emoji: string;
        tempId?: string;
    }) => void;

    unreadCountUpdated: (data: { conversationId: string; count: number }) => void;

    conversationUpdated: (conversation: ConversationPayload) => void;
    groupCreated: (conversation: ConversationPayload) => void;

    userOnline: (userId: string) => void;
    userOffline: (userId: string) => void;
    onlineUsers: (users: string[]) => void;

    typingStarted: (data: { conversationId: string; userId: string }) => void;
    typingStopped: (data: { conversationId: string; userId: string }) => void;

    receiveBroadcastMessage: (message: MessagePayload) => void;
    receiveRoomMessage: (message: MessagePayload) => void;
    receiveGroupMessage: (message: MessagePayload) => void;

    roomCreated: (roomId: string) => void;
    roomJoined: (roomId: string) => void;
    roomLeft: (roomId: string) => void;
    roomUsers: (data: { roomId: string; users: string[] }) => void;
    roomNotification: (message: string) => void;

    errorMessage: (message: string) => void;

    incomingCall: (data: {
        from: string;
        conversationId: string;
        offer: RTCSessionDescriptionInit;
        callType: "audio" | "video";
        callId: string;
    }) => void;

    callAnswered: (data: {
        from: string;
        conversationId: string;
        answer: RTCSessionDescriptionInit;
        callId: string;
    }) => void;

    iceCandidateReceived: (data: {
        from: string;
        candidate: RTCIceCandidateInit;
        callId: string;
    }) => void;
    callRejected: (data: { from: string; conversationId: string; callId: string }) => void;

    callEnded: (data: { from: string; conversationId: string; callId: string }) => void;

    callUserOffline: (data: { to: string; conversationId: string }) => void;
    callBusy: (data: {
        userId: string;
        message: string;
    }) => void;
}

export interface InterServerEvents { }

export interface SocketData {
    userId?: string;
}

export interface ReplyToPayload {
    messageId: string;
    senderId: string;
    text?: string;
    type?: MessageType;
    fileName?: string;
}

export interface SendMessageData {
    conversationId: string;
    clientMessageId: string;
    tempId: string;
    type: MessageType;
    text?: string;
    mediaUrl?: string;
    mimeType?: string;
    fileName?: string;
    fileSize?: number;
    duration?: number;
    caption?: string;
    thumbnailUrl?: string;
    latitude?: number;
    longitude?: number;
    locationName?: string;
    contactName?: string;
    contactPhone?: string;
    replyTo?: string;
}
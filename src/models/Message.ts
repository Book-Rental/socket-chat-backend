import mongoose, { Document, Schema } from "mongoose";

export type MessageType =
    | "text"
    | "image"
    | "video"
    | "audio"
    | "file"
    | "location"
    | "contact"
    | "system";

export type MessageStatus = "sent" | "delivered" | "read";

export type MessageContentKind = "text" | "emoji";

/**
 * WhatsApp-style content object.
 *
 * The top-level Message.type (text/image/video/...) decides which of
 * these fields are populated. Independently, content.type tells the
 * client how to *render* text content: "emoji" means the text is made
 * up entirely of emoji (so the client can show it larger, like WhatsApp
 * does for emoji-only messages), "text" is everything else.
 *
 *  - text                -> { type: "text" | "emoji", text }
 *  - image/video/audio/file -> { mediaUrl, mimeType, fileName, fileSize, duration?, caption?, thumbnailUrl? }
 *  - location             -> { latitude, longitude, locationName? }
 *  - contact              -> { contactName, contactPhone }
 *  - system               -> { type: "text", text }  (e.g. "You created this group")
 *
 * For a plain text message this collapses to exactly what was asked for:
 *   { "type": "text", "text": "Hi" }
 * And for an emoji-only message:
 *   { "type": "emoji", "text": "😀🎉" }
 */
export interface IMessageContent {
    type?: MessageContentKind;
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
}

export interface IReaction {
    userId: string;
    emoji: string;
    reactedAt: Date;
}

export interface IMessage extends Document {
    conversationId: mongoose.Types.ObjectId;
    senderId: string;
    type: MessageType;
    content?: IMessageContent;
    clientMessageId?: string;
    status: MessageStatus;
    replyTo?: mongoose.Types.ObjectId;

    reactions: IReaction[];
    starredBy: string[];
    forwarded: boolean;

    // per-recipient delivery / read receipts (WhatsApp double/blue tick, also works for groups)
    deliveredTo: string[];
    readBy: string[];

    // "delete for me" vs "delete for everyone"
    deletedFor: string[];
    deletedForEveryone: boolean;

    editedAt?: Date;
    deletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const messageContentSchema = new Schema<IMessageContent>(
    {
        type: {
            type: String,
            enum: ["text", "emoji"],
            default: "text",
        },
        text: { type: String, trim: true },
        mediaUrl: { type: String, trim: true },
        mimeType: { type: String, trim: true },
        fileName: { type: String, trim: true },
        fileSize: { type: Number },
        duration: { type: Number },
        caption: { type: String, trim: true },
        thumbnailUrl: { type: String, trim: true },
        latitude: { type: Number },
        longitude: { type: Number },
        locationName: { type: String, trim: true },
        contactName: { type: String, trim: true },
        contactPhone: { type: String, trim: true },
    },
    { _id: false }
);

const reactionSchema = new Schema<IReaction>(
    {
        userId: { type: String, required: true },
        emoji: { type: String, required: true },
        reactedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const messageSchema = new Schema<IMessage>(
    {
        conversationId: {
            type: Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
            index: true,
        },

        senderId: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },

        type: {
            type: String,
            enum: [
                "text",
                "image",
                "video",
                "audio",
                "file",
                "location",
                "contact",
                "system",
            ],
            default: "text",
            required: true,
            index: true,
        },

        content: {
            type: messageContentSchema,
            required: false,
        },

        clientMessageId: {
            type: String,
            trim: true,
        },

        replyTo: {
            type: Schema.Types.ObjectId,
            ref: "Message",
        },

        status: {
            type: String,
            enum: ["sent", "delivered", "read"],
            default: "sent",
            index: true,
        },

        reactions: {
            type: [reactionSchema],
            default: [],
        },

        starredBy: {
            type: [String],
            default: [],
        },

        forwarded: {
            type: Boolean,
            default: false,
        },

        deliveredTo: {
            type: [String],
            default: [],
        },

        readBy: {
            type: [String],
            default: [],
        },

        deletedFor: {
            type: [String],
            default: [],
        },

        deletedForEveryone: {
            type: Boolean,
            default: false,
        },

        editedAt: {
            type: Date,
        },

        deletedAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, clientMessageId: 1 });

export const Message = mongoose.model<IMessage>("Message", messageSchema);
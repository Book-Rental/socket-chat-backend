import mongoose, {
    Document,
    Schema,
} from "mongoose";

export type MessageType =
    | "text"
    | "image"
    | "file"
    | "audio"
    | "video"
    | "system";

export interface IMessage
    extends Document {

    conversationId:
    mongoose.Types.ObjectId;

    senderId: string;

    type: MessageType;

    content?: string;

    clientMessageId?: string;

    replyTo?:
    mongoose.Types.ObjectId;

    editedAt?: Date;

    deletedAt?: Date;

    createdAt: Date;

    updatedAt: Date;
}

const messageSchema =
    new Schema<IMessage>(
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
                    "file",
                    "audio",
                    "video",
                    "system",
                ],
                default: "text",
                required: true,
                index: true,
            },

            content: {
                type: String,
                trim: true,
            },

            clientMessageId: {
                type: String,
                trim: true,
            },

            replyTo: {
                type: Schema.Types.ObjectId,
                ref: "Message",
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

messageSchema.index({
    conversationId: 1,
    createdAt: -1,
});

messageSchema.index({
    conversationId: 1,
    clientMessageId: 1,
});

export const Message =
    mongoose.model<IMessage>(
        "Message",
        messageSchema
    );
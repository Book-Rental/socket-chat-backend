import mongoose, {
    Document,
    Schema,
} from "mongoose";

export type ConversationType =
    | "private"
    | "group"
    | "broadcast"
    | "room";

export interface IConversation extends Document {
    type: ConversationType;

    conversationKey?: string;

    name?: string;

    description?: string;

    createdBy?: string;

    participants: string[];

    lastMessageId?: mongoose.Types.ObjectId;

    lastMessageAt?: Date;

    messageCount: number;

    createdAt: Date;

    updatedAt: Date;
}

const conversationSchema =
    new Schema<IConversation>(
        {
            type: {
                type: String,
                enum: [
                    "private",
                    "group",
                    "broadcast",
                    "room",
                ],
                required: true,
                index: true,
            },

            conversationKey: {
                type: String,
                unique: true,
                sparse: true,
                index: true,
            },

            name: {
                type: String,
                trim: true,
            },

            description: {
                type: String,
                trim: true,
            },

            createdBy: {
                type: String,
                trim: true,
                index: true,
            },

            participants: [
                {
                    type: String,
                    required: true,
                    trim: true,
                    index: true,
                },
            ],

            lastMessageId: {
                type: Schema.Types.ObjectId,
                ref: "Message",
            },

            lastMessageAt: {
                type: Date,
                index: true,
            },

            messageCount: {
                type: Number,
                default: 0,
                min: 0,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

conversationSchema.index({
    participants: 1,
    updatedAt: -1,
});

conversationSchema.index({
    type: 1,
    updatedAt: -1,
});

export const Conversation =
    mongoose.model<IConversation>(
        "Conversation",
        conversationSchema
    );
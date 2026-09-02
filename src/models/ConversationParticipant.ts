import mongoose, {
    Document,
    Schema,
} from "mongoose";

export type ParticipantRole =
    | "member"
    | "admin"
    | "owner";

export interface IConversationParticipant
    extends Document {

    conversationId:
    mongoose.Types.ObjectId;

    userId: string;

    role: ParticipantRole;

    lastReadMessageId?:
    mongoose.Types.ObjectId;

    lastReadAt?: Date;

    lastDeliveredMessageId?:
    mongoose.Types.ObjectId;

    lastDeliveredAt?: Date;

    unreadCount: number;

    muted: boolean;

    archived: boolean;

    joinedAt: Date;

    leftAt?: Date;

    createdAt: Date;

    updatedAt: Date;
}

const participantSchema =
    new Schema<IConversationParticipant>(
        {
            conversationId: {
                type: Schema.Types.ObjectId,
                ref: "Conversation",
                required: true,
                index: true,
            },

            userId: {
                type: String,
                required: true,
                index: true,
                trim: true,
            },

            role: {
                type: String,
                enum: [
                    "member",
                    "admin",
                    "owner",
                ],
                default: "member",
            },

            lastReadMessageId: {
                type: Schema.Types.ObjectId,
                ref: "Message",
            },

            lastReadAt: {
                type: Date,
            },

            lastDeliveredMessageId: {
                type: Schema.Types.ObjectId,
                ref: "Message",
            },

            lastDeliveredAt: {
                type: Date,
            },

            unreadCount: {
                type: Number,
                default: 0,
                min: 0,
            },

            muted: {
                type: Boolean,
                default: false,
            },

            archived: {
                type: Boolean,
                default: false,
            },

            joinedAt: {
                type: Date,
                default: Date.now,
            },

            leftAt: {
                type: Date,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

participantSchema.index(
    {
        conversationId: 1,
        userId: 1,
    },
    {
        unique: true,
    }
);

participantSchema.index({
    userId: 1,
    updatedAt: -1,
});

export const ConversationParticipant =
    mongoose.model<IConversationParticipant>(
        "ConversationParticipant",
        participantSchema
    );
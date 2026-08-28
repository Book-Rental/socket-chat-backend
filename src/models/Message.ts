import mongoose, {
    Document,
    Schema
} from "mongoose";

export interface IMessage extends Document {
    from: string;
    to?: string;
    recipients?: string[];
    roomId?: string;
    content: string;
    timestamp: number;
    type: "private" | "group" | "broadcast" | "room";
}

const messageSchema = new Schema<IMessage>(
    {
        from: {
            type: String,
            required: true,
            index: true,
        },

        to: {
            type: String,
            index: true,
        },

        recipients: [{
            type: String,
            index: true,
        }],

        roomId: {
            type: String,
            index: true,
        },

        content: {
            type: String,
            required: true,
            trim: true,
        },

        timestamp: {
            type: Number,
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: [
                "private",
                "group",
                "broadcast",
                "room"
            ],
            required: true,
            index: true,
        },
    },
    {
        versionKey: false,
    }
);

export const Message =
    mongoose.model<IMessage>(
        "Message",
        messageSchema
    );
import mongoose, {
    Document,
    Schema,
} from "mongoose";

export interface IRoom
    extends Document {

    roomId: string;

    name?: string;

    createdBy: string;

    createdAt: Date;

    updatedAt: Date;
}

const roomSchema =
    new Schema<IRoom>(
        {
            roomId: {
                type: String,
                required: true,
                unique: true,
                index: true,
                trim: true,
            },

            name: {
                type: String,
                trim: true,
            },

            createdBy: {
                type: String,
                required: true,
                index: true,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

export const Room =
    mongoose.model<IRoom>(
        "Room",
        roomSchema
    );
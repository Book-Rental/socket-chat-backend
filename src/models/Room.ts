import mongoose, { Schema } from "mongoose";

const roomSchema = new Schema({
    roomId: { type: String, required: true, unique: true },
    createdBy: { type: String, required: true },
    members: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
});

export const Room = mongoose.model("Room", roomSchema);
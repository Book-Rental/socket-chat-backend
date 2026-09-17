import mongoose from "mongoose";
import { Message } from "../models/Message";

export async function findMessageByIdOrTempId(
    messageId: string
) {
    if (mongoose.Types.ObjectId.isValid(messageId)) {
        const message = await Message.findById(messageId);

        if (message) {
            return message;
        }
    }

    return Message.findOne({
        tempId: messageId,
    });
}
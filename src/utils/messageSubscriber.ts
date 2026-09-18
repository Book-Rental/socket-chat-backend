import mongoose from "mongoose";
import { messageSubClient } from "../config/redis";
import { Message } from "../models/Message";

const MESSAGE_CHANNEL = "chat:messages";

export const startMessageSubscriber = async (): Promise<void> => {
    await messageSubClient.subscribe(
        MESSAGE_CHANNEL,
        async (rawMessage) => {
            try {
                console.log(
                    "Redis message received:",
                    rawMessage
                );

                const messageData = JSON.parse(rawMessage);

                if (messageData.replyTo) {
                    messageData.replyTo = new mongoose.Types.ObjectId(
                        messageData.replyTo
                    );
                }

                const existingMessage = await Message.findOne({
                    tempId: messageData.tempId,
                });

                if (existingMessage) {
                    console.log(
                        "Duplicate message ignored:",
                        messageData.tempId
                    );
                    return;
                }

                const savedMessage = await Message.create(messageData);

                console.log(
                    "Message saved:",
                    savedMessage._id.toString()
                );
            } catch (error) {
                console.error(
                    "MESSAGE SUBSCRIBER ERROR:",
                    error
                );
            }
        }
    );

    console.log(
        `Subscribed to Redis channel: ${MESSAGE_CHANNEL}`
    );
};
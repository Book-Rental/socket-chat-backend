import mongoose from "mongoose";
import { messageSubClient } from "../config/redis";
import { Message } from "../models/Message";
import { Conversation } from "../models/Conversation";
import { ConversationParticipant } from "../models/ConversationParticipant";

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

                const savedMessage = await Message.findOneAndUpdate(
                    { tempId: messageData.tempId },
                    { $setOnInsert: messageData },
                    {
                        returnDocument: "after",
                        upsert: true,
                        timestamps: false,
                    }
                );

                // Update conversation metadata only when
                // the message was newly inserted.
                if (savedMessage) {
                    await Conversation.findByIdAndUpdate(
                        messageData.conversationId,
                        {
                            $set: {
                                lastMessageId: savedMessage._id,
                                lastMessageAt: savedMessage.createdAt,
                            },
                            $inc: {
                                messageCount: 1,
                            },
                        }
                    );

                    // Increase unread count for recipients
                    for (const recipientId of messageData.recipientIds) {
                        await ConversationParticipant.updateOne(
                            {
                                conversationId:
                                    messageData.conversationId,
                                userId: recipientId,
                                leftAt: {
                                    $exists: false,
                                },
                            },
                            {
                                $inc: {
                                    unreadCount: 1,
                                },
                            }
                        );
                    }
                }

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
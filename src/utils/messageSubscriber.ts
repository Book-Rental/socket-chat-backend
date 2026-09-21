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

                const savedMessage = await Message.create(
                    messageData
                );

                // Update conversation metadata after saving the message.
                // messageCount is used by getUserConversations() to determine
                // whether a conversation should be displayed in the sidebar.

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
                            conversationId: messageData.conversationId,
                            userId: recipientId,
                            leftAt: { $exists: false },
                        },
                        {
                            $inc: {
                                unreadCount: 1,
                            },
                        }
                    );
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
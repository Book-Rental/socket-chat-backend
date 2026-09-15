import { MessagePayload, ReplyToPayload } from "../types/types";

function buildReplyToPayload(replyToDoc: any): ReplyToPayload | undefined {
    // Not set, or not populated (still a bare ObjectId) -> nothing to show
    if (!replyToDoc || !replyToDoc._id) return undefined;

    return {
        messageId: replyToDoc._id.toString(),
        senderId: replyToDoc.senderId,
        text: replyToDoc.deletedAt ? undefined : replyToDoc.content?.text,
        type: replyToDoc.type,
        fileName: replyToDoc.deletedAt ? undefined : replyToDoc.content?.fileName,
    };
}

export const toMessagePayload = (message: any): MessagePayload => ({
    id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId,
    type: message.type,
    content: message.content,
    clientMessageId: message.clientMessageId,
    replyTo: buildReplyToPayload(message.replyTo),
    status: message.status,
    forwarded: message.forwarded ?? false,
    forwardCount: message.forwardCount ?? 0,
    editedAt: message.editedAt?.toISOString(),
    deletedAt: message.deletedAt?.toISOString(),
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
});
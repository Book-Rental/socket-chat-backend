import { MessagePayload, ReplyToPayload } from "../types/types";

function buildReplyToPayload(replyToDoc: any, viewerId?: string): ReplyToPayload | undefined {
    // Not set, or not populated (still a bare ObjectId) -> nothing to show
    if (!replyToDoc || !replyToDoc._id) return undefined;

    const hiddenForViewer =
        replyToDoc.deletedForEveryone ||
        (viewerId && replyToDoc.deletedFor?.includes(viewerId));

    return {
        messageId: replyToDoc._id.toString(),
        senderId: replyToDoc.senderId,
        text: hiddenForViewer ? undefined : replyToDoc.content?.text,
        type: replyToDoc.type,
        fileName: hiddenForViewer ? undefined : replyToDoc.content?.fileName,
    };
}

export const toMessagePayload = (message: any, viewerId?: string): MessagePayload => {
    const deletedForMe =
        Boolean(viewerId) && (message.deletedFor ?? []).includes(viewerId);

    const deletedForEveryone = Boolean(message.deletedForEveryone);

    const isHidden = deletedForEveryone || deletedForMe;

    return {
        id: message._id.toString(),
        tempId: message.tempId,
        conversationId: message.conversationId.toString(),
        senderId: message.senderId,
        type: message.type,
        content: isHidden ? undefined : message.content,
        clientMessageId: message.clientMessageId,
        replyTo: buildReplyToPayload(message.replyTo, viewerId),
        status: message.status,
        forwarded: message.forwarded ?? false,
        forwardCount: message.forwardCount ?? 0,
        editedAt: message.editedAt?.toISOString(),
        deletedAt: message.deletedAt?.toISOString(),
        deletedForEveryone,
        deletedForMe,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
    };
};
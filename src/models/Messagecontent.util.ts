import { IMessageContent, MessageType } from "./Message";

/**
 * Matches a string made up ONLY of emoji (plus optional joiners/variation
 * selectors/whitespace between them) - e.g. "😀", "🎉🎉🎉", "👍 😂".
 * A message like "Hi 😀" will NOT match, since it has letters too.
 */
const EMOJI_ONLY_REGEX =
    /^[\p{Extended_Pictographic}\u200D\uFE0F\s]+$/u;

/** Max emoji before we stop treating it as "big emoji" and fall back to normal text sizing. */
const MAX_EMOJI_FOR_BIG_DISPLAY = 6;

export function isEmojiOnly(text: string): boolean {
    if (!text) return false;

    const trimmed = text.trim();
    if (!trimmed) return false;

    if (!EMOJI_ONLY_REGEX.test(trimmed)) return false;

    // Count actual emoji (not whitespace/joiners) via the segmenter when available.
    const graphemeCount = Array.from(trimmed).length;
    return graphemeCount <= MAX_EMOJI_FOR_BIG_DISPLAY;
}

/**
 * Builds a clean IMessageContent object from whatever the client sent,
 * stripping out fields that don't belong to the given message type.
 *
 * Use this in your sendMessage socket handler / REST controller instead
 * of trusting the client's content object as-is.
 *
 * Example:
 *   buildMessageContent("text", { text: "Hi" })
 *   -> { type: "text", text: "Hi" }
 *
 *   buildMessageContent("text", { text: "😀🎉" })
 *   -> { type: "emoji", text: "😀🎉" }
 *
 *   buildMessageContent("image", { mediaUrl, mimeType, caption })
 *   -> { mediaUrl, mimeType, caption }
 */
export function buildMessageContent(
    type: MessageType,
    payload: Partial<IMessageContent>
): IMessageContent {
    switch (type) {
        case "text":
        case "system": {
            const text = (payload.text ?? "").trim();
            return {
                type: isEmojiOnly(text) ? "emoji" : "text",
                text,
            };
        }

        case "image":
        case "video":
        case "audio":
        case "file":
            return {
                mediaUrl: payload.mediaUrl,
                mimeType: payload.mimeType,
                fileName: payload.fileName,
                fileSize: payload.fileSize,
                duration: payload.duration,
                caption: payload.caption,
                thumbnailUrl: payload.thumbnailUrl,
            };

        case "location":
            return {
                latitude: payload.latitude,
                longitude: payload.longitude,
                locationName: payload.locationName,
            };

        case "contact":
            return {
                contactName: payload.contactName,
                contactPhone: payload.contactPhone,
            };

        default:
            return {};
    }
}

/** Returns true if the content object has the minimum required fields for its type. */
export function isValidMessageContent(
    type: MessageType,
    content: IMessageContent
): boolean {
    switch (type) {
        case "text":
        case "system":
            return !!content.text;
        case "image":
        case "video":
        case "audio":
        case "file":
            return !!content.mediaUrl;
        case "location":
            return (
                typeof content.latitude === "number" &&
                typeof content.longitude === "number"
            );
        case "contact":
            return !!content.contactName && !!content.contactPhone;
        default:
            return false;
    }
}
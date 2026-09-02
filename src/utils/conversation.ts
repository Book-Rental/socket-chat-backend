export const createPrivateConversationKey = (
    userA: string,
    userB: string
): string => {
    return [
        userA.trim(),
        userB.trim(),
    ]
        .sort()
        .join(":");
};
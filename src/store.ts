import { pubClient } from "./config/redis";

const ONLINE_USERS_KEY = "chat:onlineUsers";

export async function setOnlineUser(userId: string, socketId: string): Promise<void> {
    await pubClient.hSet(ONLINE_USERS_KEY, userId, socketId);
}

export async function getOnlineUser(userId: string): Promise<string | null> {
    return pubClient.hGet(ONLINE_USERS_KEY, userId);
}

export async function removeOnlineUser(userId: string, socketId: string): Promise<void> {
    const currentSocketId = await getOnlineUser(userId);

    if (currentSocketId === socketId) {
        await pubClient.hDel(ONLINE_USERS_KEY, userId);
    }
}

export async function getOnlineUsers(): Promise<string[]> {
    return pubClient.hKeys(ONLINE_USERS_KEY);
}
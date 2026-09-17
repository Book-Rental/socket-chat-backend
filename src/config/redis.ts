import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) throw new Error("REDIS_URL is not defined");

export const pubClient = createClient({ url: redisUrl });
export const messageSubClient = pubClient.duplicate();

pubClient.on("error", error => console.error("Redis Publisher Error:", error));
messageSubClient.on("error", error => console.error("Redis Message Subscriber Error:", error));

export const connectRedis = async (): Promise<void> => {
    try {
        await Promise.all([
            pubClient.connect(),
            messageSubClient.connect(),
        ]);
        console.log("Redis connected successfully");
    } catch (error) {
        console.error("Redis connection failed:", error);
        throw error;
    }
};

export const disconnectRedis = async (): Promise<void> => {
    try {
        await Promise.all([
            pubClient.quit(),
            messageSubClient.quit(),
        ]);
        console.log("Redis disconnected");
    } catch (error) {
        console.error("Redis disconnect error:", error);
    }
};




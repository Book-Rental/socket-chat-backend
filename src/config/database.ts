import mongoose from "mongoose";

export const connectDatabase = async (): Promise<void> => {
    try {
        const mongoUri = process.env.CHAT_MONGO_URI;

        if (!mongoUri) {
            throw new Error(
                "CHAT_MONGO_URI is not defined"
            );
        }

        await mongoose.connect(mongoUri);

        console.log(
            "Chat MongoDB connected successfully"
        );
    } catch (error) {
        console.error(
            "Chat MongoDB connection failed:",
            error
        );

        process.exit(1);
    }
};
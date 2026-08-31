import { Request, Response } from "express";
import { Message } from "../models/Message";

const HISTORY_LIMIT = 100;

export const getPrivateHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userA, userB } = req.params;

        if (!userA || !userB) {
            res.status(400).json({ message: "Both user ids are required" });
            return;
        }

        const messages = await Message.find({
            type: "private",
            $or: [
                { from: userA, to: userB },
                { from: userB, to: userA },
            ],
        })
            .sort({ timestamp: 1 })
            .limit(HISTORY_LIMIT)
            .lean();

        res.json({ messages });
    } catch (error) {
        console.error("GET PRIVATE HISTORY ERROR:", error);
        res.status(500).json({ message: "Failed to fetch private history" });
    }
};

export const getRoomHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const { roomId } = req.params;

        if (!roomId) {
            res.status(400).json({ message: "Room id is required" });
            return;
        }

        const messages = await Message.find({ type: "room", roomId })
            .sort({ timestamp: 1 })
            .limit(HISTORY_LIMIT)
            .lean();

        res.json({ messages });
    } catch (error) {
        console.error("GET ROOM HISTORY ERROR:", error);
        res.status(500).json({ message: "Failed to fetch room history" });
    }
};

export const getBroadcastHistory = async (_req: Request, res: Response): Promise<void> => {
    try {
        const messages = await Message.find({ type: "broadcast" })
            .sort({ timestamp: 1 })
            .limit(HISTORY_LIMIT)
            .lean();

        res.json({ messages });
    } catch (error) {
        console.error("GET BROADCAST HISTORY ERROR:", error);
        res.status(500).json({ message: "Failed to fetch broadcast history" });
    }
};

export const getGroupHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;

        if (!userId) {
            res.status(400).json({ message: "User id is required" });
            return;
        }

        const messages = await Message.find({
            type: "group",
            $or: [{ from: userId }, { recipients: userId }],
        })
            .sort({ timestamp: 1 })
            .limit(HISTORY_LIMIT)
            .lean();

        res.json({ messages });
    } catch (error) {
        console.error("GET GROUP HISTORY ERROR:", error);
        res.status(500).json({ message: "Failed to fetch group history" });
    }
};
import { Router } from "express";
import { getPrivateHistory, getRoomHistory, getBroadcastHistory, getGroupHistory } from "../controllers/messageController";

const router = Router();

router.get("/private/:userA/:userB", getPrivateHistory);
router.get("/room/:roomId", getRoomHistory);
router.get("/broadcast", getBroadcastHistory);
router.get("/group/:userId", getGroupHistory);

export default router;
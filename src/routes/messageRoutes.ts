import { Router } from "express";
import { getChattedUsers, getConversationHistory, getUnreadCounts, getUserConversations, markAsRead, searchConversationsByText } from "../controllers/messageController";

const router = Router();

router.get("/conversation/:conversationId", getConversationHistory);
router.get("/conversations/:userId", getUserConversations);
router.get("/unread/:userId", getUnreadCounts);
router.get("/chatted-users/:userId", getChattedUsers);
router.post("/read", markAsRead);
router.get("/search-conversations", searchConversationsByText);

export default router;
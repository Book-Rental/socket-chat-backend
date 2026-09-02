import {
    Router,
} from "express";

import {
    getConversationHistory,
    getUnreadCounts,
    getUserConversations,
} from "../controllers/messageController";

const router =
    Router();

router.get(
    "/conversation/:conversationId",
    getConversationHistory
);

router.get(
    "/conversations/:userId",
    getUserConversations
);

router.get(
    "/unread/:userId",
    getUnreadCounts
);

export default router;
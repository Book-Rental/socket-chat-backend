import { Router } from "express";
import {
    createPrivateConversation,
    getConversationDetails,
} from "../controllers/conversationController";

const router = Router();

router.post("/private", createPrivateConversation);

// GET /api/conversations/:conversationId/details?userId=<me>&limit=50&before=<isoDate>
router.get("/:conversationId/details", getConversationDetails);

export default router;
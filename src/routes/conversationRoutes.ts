import { Router } from "express";
import {
    createPrivateConversation,
} from "../controllers/conversationController";

const router = Router();

router.post(
    "/private",
    createPrivateConversation
);

export default router;
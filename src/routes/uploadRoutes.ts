import { Router } from "express";
import { upload, uploadFile } from "../components/uploadController";

const router = Router();

router.post("/", upload.single("file"), uploadFile);

export default router;
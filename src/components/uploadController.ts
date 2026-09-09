import { Request, Response } from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary";

const storage = multer.memoryStorage();

export const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024,
    },
});

export const uploadFile = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({
                message: "File is required",
            });
            return;
        }

        const file = req.file;

        const resourceType =
            file.mimetype.startsWith("image/")
                ? "image"
                : file.mimetype.startsWith("video/")
                    ? "video"
                    : file.mimetype.startsWith("audio/")
                        ? "video"
                        : "raw";

        const result = await new Promise<any>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    resource_type: resourceType,
                    folder: "chat-media",
                    public_id: `${Date.now()}-${file.originalname
                        .replace(/\s+/g, "-")
                        .replace(/[^a-zA-Z0-9._-]/g, "")}`,
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            );

            stream.end(file.buffer);
        });

        res.status(201).json({
            message: "File uploaded successfully",
            file: {
                mediaUrl: result.secure_url,
                mimeType: file.mimetype,
                fileName: file.originalname,
                fileSize: file.size,
                resourceType,
            },
        });
    } catch (error) {
        console.error("UPLOAD FILE ERROR:", error);

        res.status(500).json({
            message: "Failed to upload file",
        });
    }
};
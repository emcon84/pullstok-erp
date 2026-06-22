// imageRoutes.ts — product image upload backed by Cloudflare R2.
// (File name kept as cloudinaryRoutes for import-path back-compat; Cloudinary is no longer used.)
import express from "express";
import multer from "multer";
import { uploadImageToR2 } from "../config/storage";

const router = express.Router();

// memoryStorage: handlers receive req.file.buffer (no disk writes) so we can
// stream straight to R2.
const upload = multer({ storage: multer.memoryStorage() });

// Ruta para subir imágenes -> POST /api/image/upload
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const url = await uploadImageToR2(req.file, "products");
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

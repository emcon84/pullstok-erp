// uploadRoutes.ts
import express from "express";
import multer from "multer";
import path from "path";

const router = express.Router();

// Configuración de multer para guardar imágenes localmente
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Carpeta donde se guardan las imágenes
  },
  filename: (req, file, cb) => {
    // Generar nombre único: timestamp + extensión original
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// Ruta para subir imágenes
router.post("/upload", upload.single("image"), async (req, res) => {
  console.log(req.file);
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Devolver la URL relativa de la imagen
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ url: imageUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

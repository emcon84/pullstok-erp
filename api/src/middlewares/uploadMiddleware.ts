// src/middleware/upload.ts
import multer from "multer";
import path from "path";
import { Request, Response, NextFunction } from "express";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Carpeta donde se guardan los archivos subidos
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const upload = multer({ storage });

// ── Subida de PDFs de planillas de proveedor (sdd/alican-wholesale-price-list) ──
// Multer DEDICADO: el `upload` existente no tiene limits ni fileFilter. El PDF
// se escribe en uploads/ con nombre Date.now() y se BORRA tras parsear (D5);
// sourceFilename conserva el nombre original.

export const PDF_MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const pdfFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const isPdf =
    file.mimetype === "application/pdf" ||
    path.extname(file.originalname).toLowerCase() === ".pdf";
  if (isPdf) return cb(null, true);
  cb(new Error("Solo se aceptan archivos PDF"));
};

export const uploadPdf = multer({
  storage,
  limits: { fileSize: PDF_MAX_SIZE },
  fileFilter: pdfFileFilter,
});

/** Mapea errores de multer: 413 tamaño, 400 archivo no-PDF. */
export const handleUploadError = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "El archivo excede 10MB" });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  return res.status(400).json({ message: err.message || "Archivo inválido" });
};

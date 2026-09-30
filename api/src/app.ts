import * as dotenv from "dotenv";
import express from "express";
import connectDB from "./config/db";
import apiRoutes from "./routes/index";
import cors from "cors";

dotenv.config();
connectDB();

const app = express();

// Orígenes permitidos vía env (CORS_ORIGINS, separados por coma).
// Fallback a localhost para desarrollo.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
  }),
);

// Los tickets ESC/POS (base64, hasta 256 KB decodificados ≈ 350 KB) superan el
// límite por defecto de 100 KB: esta ruta parsea primero con un tope mayor y el
// parser global de abajo ya no vuelve a leer el body.
app.use("/api/print-jobs", express.json({ limit: "512kb" }));

// JSON parser con captura del body crudo. Kapso firma el body EXACTO con un
// HMAC (x-webhook-signature), y `JSON.stringify` del body ya parseado NO
// reproduce los bytes originales → hay que verificar la firma contra este
// buffer (req.rawBody), no contra req.body.
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// Servir archivos estáticos desde la carpeta uploads
app.use("/uploads", express.static("uploads"));

app.use("/api", apiRoutes);

export default app;

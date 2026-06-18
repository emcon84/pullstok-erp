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

app.use(express.json());

// Servir archivos estáticos desde la carpeta uploads
app.use("/uploads", express.static("uploads"));

app.use("/api", apiRoutes);

export default app;

import { Router } from "express";
import productRoutes from "./productRoutes";
import authRoutes from "./authRoutes";
import customerRoutes from "./customerRoutes";
import orderRoutes from "./orderRoutes";
import quotationRoutes from "./quotationRoutes";
import uploadRoutes from "./cloudinaryRoutes";
import salesRoutes from "./salesRoutes";
import healthRoutes from "./healthRoutes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/image", uploadRoutes);
router.use("/products", productRoutes);
router.use("/sales", salesRoutes);
router.use("/customers", customerRoutes);
router.use("/orders", orderRoutes);
router.use("/quotations", quotationRoutes);
router.use("/receipts", quotationRoutes);
router.use("/health", healthRoutes);

export default router;

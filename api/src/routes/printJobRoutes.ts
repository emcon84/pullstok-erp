import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { createPrintJobSchema } from "../validation/schemas";
import { createPrintJob, getPrintJob } from "../controllers/printJobController";

const router = Router();

// Cualquier rol operativo puede imprimir un ticket desde el celular.
router.use(authenticate, requireRole("ADMIN", "MANAGEMENT", "VENDEDOR", "CASHIER"));

router.post("/", validate(createPrintJobSchema), createPrintJob);
router.get("/:id", getPrintJob);

export default router;

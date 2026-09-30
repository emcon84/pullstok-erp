import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import {
  createPrinterSchema,
  updatePrinterSchema,
  createPairingCodeSchema,
} from "../validation/schemas";
import {
  createPrinter,
  listPrinters,
  updatePrinter,
  deletePrinter,
  listAgents,
  createPairingCode,
} from "../controllers/printerController";

const router = Router();

// ADMIN y MANAGEMENT gestionan impresoras y emparejan agentes.
router.use(authenticate, requireRole("ADMIN", "MANAGEMENT"));

router.get("/agents", listAgents);
router.post("/pairing-codes", validate(createPairingCodeSchema), createPairingCode);
router.post("/", validate(createPrinterSchema), createPrinter);
router.get("/", listPrinters);
router.put("/:id", validate(updatePrinterSchema), updatePrinter);
router.delete("/:id", deletePrinter);

export default router;

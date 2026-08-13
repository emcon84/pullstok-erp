import { Router } from "express";
import providerController from "../controllers/providerController";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { checkBusinessHours } from "../middlewares/checkBusinessHours";

const router = Router();

router.get("/", authenticateJWT, checkBusinessHours, providerController.listProviders);

export default router;

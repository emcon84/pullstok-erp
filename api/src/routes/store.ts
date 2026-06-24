import { Router } from "express";
import storeController from "../controllers/storeController";
import { tenantBySlug } from "../middlewares/tenantBySlug";
import { checkStoreEnabled } from "../middlewares/checkStoreEnabled";

// Router PÚBLICO de la tienda online (negocio.pullstok.com/api/store/...).
// Sin authenticateJWT: el tenant se resuelve por slug de subdominio, no por
// JWT. tenantBySlug corre primero (resuelve req.org + tenant context),
// checkStoreEnabled después (necesita req.org.plan, ya resuelto sin query
// extra).
const router = Router();

router.use(tenantBySlug, checkStoreEnabled);

router.get("/products", storeController.getProducts);
router.get("/products/:id", storeController.getProductById);
router.get("/settings", storeController.getSettings);

export default router;

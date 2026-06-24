import { Router } from "express";
import rateLimit from "express-rate-limit";
import storeController from "../controllers/storeController";
import { tenantBySlug } from "../middlewares/tenantBySlug";
import { checkStoreEnabled } from "../middlewares/checkStoreEnabled";
import { validate } from "../middlewares/validate";
import { checkoutSchema } from "../validation/schemas";

// Router PÚBLICO de la tienda online (negocio.pullstok.com/api/store/...).
// Sin authenticateJWT: el tenant se resuelve por slug de subdominio, no por
// JWT. tenantBySlug corre primero (resuelve req.org + tenant context),
// checkStoreEnabled después (necesita req.org.plan, ya resuelto sin query
// extra).
const router = Router();

router.use(tenantBySlug, checkStoreEnabled);

// Anti-spam v1 (deuda documentada en el design: in-memory, no comparte
// estado entre instancias PM2 — alcanza para v1, no bloqueante). Solo en
// checkout, que es el único endpoint que escribe.
const checkoutRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos de compra. Probá de nuevo en unos minutos." },
});

router.get("/products", storeController.getProducts);
router.get("/products/:id", storeController.getProductById);
router.get("/settings", storeController.getSettings);
router.post(
  "/checkout",
  checkoutRateLimit,
  validate(checkoutSchema),
  storeController.checkout,
);

export default router;

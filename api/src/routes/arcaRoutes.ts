import { Router } from "express";
import arcaSettingsController from "../controllers/arcaSettingsController";
import padronController from "../controllers/padronController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { arcaSettingsSchema } from "../validation/schemas";

const router = Router();

// CRUD de configuración ARCA: solo ADMIN (configura y prende el gate por org).
// El CRUD NO lleva checkArcaEnabled (esa es la función del middleware de las
// rutas de emisión); acá se edita la config aunque el gate esté apagado.
router.get(
  "/arca-settings",
  authenticateJWT,
  requireRole("ADMIN"),
  arcaSettingsController.getArcaSettings,
);
router.put(
  "/arca-settings",
  authenticateJWT,
  requireRole("ADMIN"),
  validate(arcaSettingsSchema),
  arcaSettingsController.updateArcaSettings,
);

// Gate por org: cualquier rol autenticado pregunta si ARCA está habilitado
// (sin bloquear). El front decide si muestra el paso fiscal.
router.get(
  "/arca/check-enabled",
  authenticateJWT,
  arcaSettingsController.getArcaEnabled,
);

// Padrón A4: consulta un CUIT para autocompletar clientes. Mismo gate que el
// CRUD de clientes (cualquier rol autenticado). El front no bloquea la carga
// manual si falla.
router.get(
  "/arca/padron/:cuit",
  authenticateJWT,
  padronController.getPadronByCuit,
);

export default router;

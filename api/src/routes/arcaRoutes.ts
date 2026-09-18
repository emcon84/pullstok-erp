import { Router } from "express";
import arcaSettingsController from "../controllers/arcaSettingsController";
import padronController from "../controllers/padronController";
import {
  uploadArcaCertificateFiles,
  uploadArcaCertificate,
  getArcaCertificates,
  verifyArcaService,
} from "../controllers/arcaCertificatesController";
import { authenticateJWT, requireRole } from "../middlewares/authMiddleware";
import { handleUploadError } from "../middlewares/uploadMiddleware";
import { validate } from "../middlewares/validate";
import { arcaSettingsSchema, verifyArcaServiceSchema } from "../validation/schemas";

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

// Certificados ARCA self-service (sdd/arca-certificados-self-service):
// ADMIN only, mismo guard que el CRUD de arriba. Upload multipart (cert+key)
// con multer memoryStorage; nunca se devuelven bytes de cert/key, solo
// metadata parseada.
router.post(
  "/arca-settings/certificates/:environment",
  authenticateJWT,
  requireRole("ADMIN"),
  uploadArcaCertificateFiles,
  handleUploadError,
  uploadArcaCertificate,
);
router.get(
  "/arca-settings/certificates",
  authenticateJWT,
  requireRole("ADMIN"),
  getArcaCertificates,
);
router.post(
  "/arca-settings/verify-service",
  authenticateJWT,
  requireRole("ADMIN"),
  validate(verifyArcaServiceSchema),
  verifyArcaService,
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

import { Response } from "express";
import multer from "multer";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";
import { encryptPrivateKeyPem } from "../utils/certEncryption";
import { parseCertificatePem, privateKeyMatchesCertificate } from "../utils/certParsing";
import { authenticateWsaa } from "../integrations/arca/wsaaClient";
import { ArcaError } from "../integrations/arca/types";
import type { ArcaAuthContext, ArcaEnvironment } from "../integrations/arca/types";

// ArcaCertificate: mismo patrón anti-fuga que ArcaSetting (ver comentario en
// arcaSettingsController.ts) — NUNCA en TENANT_MODELS, siempre basePrisma +
// requireOrganizationId(), y la clave compuesta (organizationId, environment)
// en vez de un id propio: no debe existir forma de leer/escribir la fila de
// otra organización aunque alguien adivine un id.

const ARCA_ENVIRONMENTS = ["HOMOLOGACION", "PRODUCCION"] as const;
type Environment = (typeof ARCA_ENVIRONMENTS)[number];

const isValidEnvironment = (value: string): value is Environment =>
  (ARCA_ENVIRONMENTS as readonly string[]).includes(value);

// Los certs reales rondan 1-2KB; 16KB da margen generoso y sigue atajando un
// upload por error del archivo equivocado (ej. un PDF).
const MAX_CERT_FILE_SIZE = 16 * 1024;

export const uploadArcaCertificateFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CERT_FILE_SIZE, files: 2 },
}).fields([
  { name: "cert", maxCount: 1 },
  { name: "key", maxCount: 1 },
]);

/** Buffer → string UTF-8 sin pérdida (round-trip exacto), o null si no es
 * texto UTF-8 válido (ej. binario subido por error). */
const decodeUtf8Strict = (buffer: Buffer): string | null => {
  const text = buffer.toString("utf8");
  return Buffer.from(text, "utf8").equals(buffer) ? text : null;
};

interface CertificateMetadata {
  environment: Environment;
  subjectCn: string | null;
  subjectCuit: string | null;
  issuer: string;
  validFrom: string;
  validTo: string;
  isExpired: boolean;
  uploadedAt: string;
  uploadedByUserId: string;
}

const toMetadata = (row: {
  environment: string;
  subjectCn: string | null;
  subjectCuit: string | null;
  issuer: string | null;
  validFrom: Date;
  validTo: Date;
  uploadedAt: Date;
  uploadedByUserId: string;
}): CertificateMetadata => ({
  environment: row.environment as Environment,
  subjectCn: row.subjectCn,
  subjectCuit: row.subjectCuit,
  issuer: row.issuer ?? "",
  validFrom: row.validFrom.toISOString(),
  validTo: row.validTo.toISOString(),
  isExpired: row.validTo.getTime() < Date.now(),
  uploadedAt: row.uploadedAt.toISOString(),
  uploadedByUserId: row.uploadedByUserId,
});

/** ADMIN: sube (o rota) el par cert+key de un ambiente para SU organización.
 * Nunca persiste nada si el par no valida (parseo o match cert/key). */
export const uploadArcaCertificate = async (req: AuthedRequest, res: Response) => {
  try {
    const environmentParam = req.params.environment;
    if (!isValidEnvironment(environmentParam)) {
      return res.status(400).json({
        message: "El ambiente debe ser HOMOLOGACION o PRODUCCION.",
      });
    }
    const environment = environmentParam;

    const files = req.files as
      | { cert?: Express.Multer.File[]; key?: Express.Multer.File[] }
      | undefined;
    const certFile = files?.cert?.[0];
    const keyFile = files?.key?.[0];
    if (!certFile || !keyFile) {
      return res.status(400).json({
        message: "Hay que subir el certificado (cert) y la clave privada (key).",
      });
    }

    const certPem = decodeUtf8Strict(certFile.buffer);
    const keyPem = decodeUtf8Strict(keyFile.buffer);
    if (certPem === null || keyPem === null) {
      return res.status(400).json({
        message: "El certificado y la clave deben ser archivos de texto PEM válidos (UTF-8).",
      });
    }

    let parsed;
    try {
      parsed = parseCertificatePem(certPem);
    } catch (err) {
      return res.status(400).json({ message: (err as Error).message });
    }

    let matches: boolean;
    try {
      matches = privateKeyMatchesCertificate(certPem, keyPem);
    } catch (err) {
      return res.status(400).json({ message: (err as Error).message });
    }
    if (!matches) {
      return res.status(400).json({
        message: "La clave privada no corresponde al certificado",
      });
    }

    const encrypted = encryptPrivateKeyPem(keyPem);
    // Prisma 7 tipa Bytes como Uint8Array<ArrayBuffer>; Buffer (Node) es
    // Uint8Array<ArrayBufferLike> — copiar a un Uint8Array fresco para que el
    // tipo calce sin castear con `any`.
    const keyCiphertext = Uint8Array.from(encrypted.ciphertext);
    const keyIv = Uint8Array.from(encrypted.iv);
    const keyAuthTag = Uint8Array.from(encrypted.authTag);

    const organizationId = requireOrganizationId();
    const uploadedByUserId = req.user!.id;

    const row = await basePrisma.arcaCertificate.upsert({
      where: { organizationId_environment: { organizationId, environment } },
      update: {
        certPem,
        keyCiphertext,
        keyIv,
        keyAuthTag,
        subjectCn: parsed.subjectCn,
        subjectCuit: parsed.subjectCuit,
        issuer: parsed.issuer,
        validFrom: parsed.validFrom,
        validTo: parsed.validTo,
        uploadedByUserId,
      },
      create: {
        organizationId,
        environment,
        certPem,
        keyCiphertext,
        keyIv,
        keyAuthTag,
        subjectCn: parsed.subjectCn,
        subjectCuit: parsed.subjectCuit,
        issuer: parsed.issuer,
        validFrom: parsed.validFrom,
        validTo: parsed.validTo,
        uploadedByUserId,
      },
    });

    res.status(200).json(toMetadata(row));
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN: metadata (nunca bytes) de ambos ambientes para SU organización. */
export const getArcaCertificates = async (_req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const rows = await basePrisma.arcaCertificate.findMany({
      where: { organizationId },
    });

    const byEnvironment: Record<Environment, CertificateMetadata | null> = {
      HOMOLOGACION: null,
      PRODUCCION: null,
    };
    for (const row of rows) {
      byEnvironment[row.environment as Environment] = toMetadata(row);
    }

    res.status(200).json(byEnvironment);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// --- Verificación de servicio (probe WSAA rate-limitado) ---

type VerifyOutcome = "habilitado" | "no_habilitado" | "error";

/** Cooldown en memoria por `${organizationId}:${service}` (mismo patrón que
 * taCache en wsaaClient.ts). AFIP homologación tiene una retención real de TA
 * ya autenticado (Engram #329) — nunca puede ser un botón de click libre. */
const VERIFY_SERVICE_COOLDOWN_MS = 5 * 60 * 1000;
const verifyServiceCooldown = new Map<string, number>();

/** Solo para tests. */
export const clearVerifyServiceCooldown = (): void => {
  verifyServiceCooldown.clear();
};

// AFIP no manda un código de fault estable para esto, solo texto libre — el
// mensaje real observado es "La persona no se encuentra habilitada para
// operar el servicio" (Engram #329), no el más corto "no habilitada" que
// probarías a mano. Ventana acotada entre "no" y "habilitad" para tolerar la
// frase real sin matchear textos arbitrarios.
const AFIP_NOT_ENABLED_PATTERN = /no\b[\s\S]{0,40}?habilitad/i;

/** ADMIN: login WSAA de prueba contra el ambiente activo de la org para
 * inferir si el service está habilitado. Rate-limitado: nunca llama a WSAA
 * más de una vez cada 5 min por (org, service). */
export const verifyArcaService = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { service } = req.body as { service: "wsfe" | "ws_sr_padron_a4" };

    const cooldownKey = `${organizationId}:${service}`;
    const lastCheckedAt = verifyServiceCooldown.get(cooldownKey);
    if (lastCheckedAt !== undefined) {
      const elapsed = Date.now() - lastCheckedAt;
      if (elapsed < VERIFY_SERVICE_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil(
          (VERIFY_SERVICE_COOLDOWN_MS - elapsed) / 1000,
        );
        return res.status(429).json({
          message: `Ya se verificó este servicio hace poco. Esperá ${retryAfterSeconds}s antes de reintentar.`,
          retryAfterSeconds,
        });
      }
    }

    const setting = await basePrisma.arcaSetting.findUnique({
      where: { organizationId },
    });
    if (!setting || !setting.cuitEmisor || setting.puntoVenta == null) {
      return res.status(200).json({
        status: "error" as VerifyOutcome,
        message: "Falta completar la configuración ARCA de la organización.",
        checkedAt: new Date().toISOString(),
      });
    }

    const environment = setting.environment as ArcaEnvironment;
    const certRow = await basePrisma.arcaCertificate.findUnique({
      where: { organizationId_environment: { organizationId, environment } },
    });
    if (!certRow) {
      return res.status(200).json({
        status: "error" as VerifyOutcome,
        message: `Falta cargar el certificado de ${environment}.`,
        checkedAt: new Date().toISOString(),
      });
    }

    const context: ArcaAuthContext = {
      organizationId,
      cuitEmisor: setting.cuitEmisor,
      padronCuit: setting.padronCuit ?? undefined,
      puntoVenta: setting.puntoVenta,
      environment,
      certPath: setting.certPath ?? "",
      keyPath: setting.keyPath ?? "",
    };

    verifyServiceCooldown.set(cooldownKey, Date.now());

    try {
      await authenticateWsaa(context, service);
      return res.status(200).json({
        status: "habilitado" as VerifyOutcome,
        message: "El servicio está habilitado para este ambiente.",
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof ArcaError && AFIP_NOT_ENABLED_PATTERN.test(err.message)) {
        return res.status(200).json({
          status: "no_habilitado" as VerifyOutcome,
          message: "AFIP indica que esta organización no está habilitada para operar este servicio.",
          checkedAt: new Date().toISOString(),
        });
      }
      return res.status(200).json({
        status: "error" as VerifyOutcome,
        message: "No se pudo verificar el servicio (error de conexión con AFIP). Reintentá más tarde.",
        checkedAt: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default {
  uploadArcaCertificateFiles,
  uploadArcaCertificate,
  getArcaCertificates,
  verifyArcaService,
  clearVerifyServiceCooldown,
};

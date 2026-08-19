import { Response } from "express";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";

// ArcaSetting es 1:1 con Organization y NO está en TENANT_MODELS (patrón
// StoreSettings/AppBranding): se accede siempre por organizationId vía
// basePrisma, nunca por id propio, para que no haya forma de leer/escribir la
// fila de otra organización aunque alguien adivine un id. Los CERTIFICADOS
// nunca viven acá: solo rutas crt/key en el VPS.

/** ADMIN: devuelve el ArcaSetting de SU organización. Create-on-read: si no
 * existe fila, se devuelven los defaults (enabled=false → gate off) sin crear
 * nada; se persiste recién cuando el ADMIN guarda por primera vez vía PUT. */
export const getArcaSettings = async (_req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const settings = await basePrisma.arcaSetting.findUnique({
      where: { organizationId },
    });

    res.status(200).json({
      cuitEmisor: settings?.cuitEmisor ?? "",
      padronCuit: settings?.padronCuit ?? null,
      puntoVenta: settings?.puntoVenta ?? null,
      environment: settings?.environment ?? "HOMOLOGACION",
      certPath: settings?.certPath ?? "",
      keyPath: settings?.keyPath ?? "",
      enabled: settings?.enabled ?? false,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN: upsert del ArcaSetting de SU organización (scoped por organizationId,
 * nunca por body). El body ya llegó validado/saneado por Zod (validate()
 * reemplaza req.body por el resultado parseado). */
export const updateArcaSettings = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const data = req.body;

    const settings = await basePrisma.arcaSetting.upsert({
      where: { organizationId },
      update: data,
      create: { organizationId, ...data },
    });

    res.status(200).json(settings);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** Cualquier rol autenticado: responde si el gate ARCA está habilitado para la
 * org (misma lógica que el middleware, sin adjuntar contexto ni bloquear). El
 * front lo usa para decidir si mostrar el paso de emisión fiscal. */
export const getArcaEnabled = async (_req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const setting = await basePrisma.arcaSetting.findUnique({
      where: { organizationId },
    });

    const enabled =
      !!setting &&
      setting.enabled === true &&
      !!setting.cuitEmisor &&
      setting.puntoVenta != null &&
      !!setting.certPath &&
      !!setting.keyPath;

    res.status(200).json({
      enabled,
      cuitEmisor: setting?.cuitEmisor,
      puntoVenta: setting?.puntoVenta,
      environment: setting?.environment,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default { getArcaSettings, updateArcaSettings, getArcaEnabled };

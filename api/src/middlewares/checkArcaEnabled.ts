import { Response, NextFunction } from "express";
import { Request } from "express";
import { basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import type { ArcaAuthContext } from "../integrations/arca/types";

// Gate de emisión fiscal ARCA por organización (design D6, patrón
// checkInvoicingEnabled). Habilitado SOLO si existe ArcaSetting con
// `enabled=true` y los campos completos (cuit, PV, rutas de cert). Si no →
// 403 ARCA_NOT_AVAILABLE y el flujo interno FAC-XXXX queda intacto (spec 3.3).
//
// En éxito, adjunta el contexto ARCA (ArcaAuthContext) al request para que el
// controller construya el ArcaClientHomo sin re-leer la fila.
export const checkArcaEnabled = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
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

    if (!enabled) {
      return res.status(403).json({ error: "ARCA_NOT_AVAILABLE" });
    }

    (req as Request & { arcaContext?: ArcaAuthContext }).arcaContext = {
      organizationId,
      cuitEmisor: setting.cuitEmisor,
      puntoVenta: setting.puntoVenta,
      environment: setting.environment,
      certPath: setting.certPath,
      keyPath: setting.keyPath,
    };

    next();
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

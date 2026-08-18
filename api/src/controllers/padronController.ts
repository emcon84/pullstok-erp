import { Response } from "express";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";
import { getPersona } from "../integrations/arca/padronClient";
import { ArcaError } from "../integrations/arca/types";
import { normalizeCuit, isValidCuit } from "../services/arcaCalc";

// Consulta al padrón A4 (ws_sr_padron_a4) para autocompletar la carga de
// clientes. Mismo gate que el CRUD de clientes (cualquier rol autenticado).
// Lee la ArcaSetting de la org (patrón basePrisma, igual que getArcaEnabled)
// para obtener certPath/keyPath/environment/cuitEmisor. El front NO bloquea la
// carga manual si esto falla: los errores se devuelven con código/mensaje
// claros pero el usuario puede seguir cargando a mano.

/** Build ArcaAuthContext desde la ArcaSetting de la org (o null si no apta). */
const buildContextFromSetting = (setting: any) => {
  if (
    !setting ||
    setting.enabled !== true ||
    !setting.cuitEmisor ||
    !setting.certPath ||
    !setting.keyPath
  ) {
    return null;
  }
  return {
    organizationId: setting.organizationId,
    cuitEmisor: setting.cuitEmisor,
    puntoVenta: setting.puntoVenta ?? 0,
    environment: setting.environment ?? "HOMOLOGACION",
    certPath: setting.certPath,
    keyPath: setting.keyPath,
  };
};

export const getPadronByCuit = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const rawCuit = req.params.cuit ?? "";

    if (!isValidCuit(rawCuit)) {
      return res.status(400).json({
        error: "CUIT_INVALIDO",
        message: "El CUIT no es válido (formato o dígito verificador incorrecto)",
      });
    }
    const cuit = normalizeCuit(rawCuit);

    const setting = await basePrisma.arcaSetting.findUnique({
      where: { organizationId },
    });

    const context = buildContextFromSetting(setting);
    if (!context) {
      return res.status(403).json({
        error: "ARCA_NOT_CONFIGURED",
        message: "ARCA no está configurado para esta organización",
      });
    }

    const persona = await getPersona(context, cuit);
    return res.status(200).json(persona);
  } catch (error: any) {
    if (error instanceof ArcaError) {
      return res.status(error.httpStatus).json({
        error: error.code,
        message: error.message,
      });
    }
    return res.status(500).json({
      error: "ARCA_PADRON_ERROR",
      message: error?.message ?? "Error al consultar el padrón de ARCA",
    });
  }
};

export default { getPadronByCuit };

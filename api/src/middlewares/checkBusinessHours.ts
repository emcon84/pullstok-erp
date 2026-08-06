import { Response, NextFunction } from "express";
import { basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { isWithinBusinessHours, DaySetting } from "../utils/businessHours";
import { AuthedRequest } from "./authMiddleware";

// Roles operativos a los que se les restringe el acceso fuera del horario
// comercial. MANAGEMENT/ADMIN/SUPERADMIN tienen fast path SIN query a la DB.
const OPERATIVE_ROLES = ["VENDEDOR", "CASHIER", "EMPLOYEE"] as const;

const OUTSIDE_MESSAGE =
  "El acceso al sistema está disponible solo dentro del horario del comercio.";

/**
 * Gate estricto de horario comercial (design business-hours-access): por
 * REQUEST, y solo para roles operativos, consulta la config 1:1 de la org
 * (BusinessHourSetting vía basePrisma por organizationId — patrón
 * StoreSettings, NO tenant-scoped) y resuelve el "now" en la timezone IANA de
 * la org. Sin setting = sin restricción (backwards compatible). Montar SIEMPRE
 * DESPUÉS de authenticateJWT (necesita req.user.role + requireOrganizationId).
 */
export const checkBusinessHours = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  // Fast path de gestión: estos roles NUNCA se bloquean y NO pagan query.
  if (
    !req.user ||
    !(OPERATIVE_ROLES as readonly string[]).includes(req.user.role)
  ) {
    return next();
  }

  try {
    const setting = await basePrisma.businessHourSetting.findUnique({
      where: { organizationId: requireOrganizationId() },
    });
    if (!setting) {
      return next(); // org sin config → sin restricción
    }

    const { allowed } = isWithinBusinessHours(
      new Date(),
      setting.timezone,
      setting.days as unknown as DaySetting[],
    );
    if (allowed) {
      return next();
    }

    return res.status(403).json({ error: "OUTSIDE_BUSINESS_HOURS", message: OUTSIDE_MESSAGE });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

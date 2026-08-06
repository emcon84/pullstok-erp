import { Response } from "express";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";
import { DaySetting } from "../utils/businessHours";

// BusinessHourSetting es 1:1 con Organization y NO está en TENANT_MODELS (ver
// db.ts): se accede siempre por organizationId vía basePrisma, nunca por id
// propio (mismo patrón que StoreSettings). Sin fila = sin restricción: el gate
// de business-hours solo se activa cuando un ADMIN guarda la config por
// primera vez (backwards compatible).
const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

const DEFAULT_DAYS: DaySetting[] = [
  { day: 0, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 1, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 2, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 3, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 4, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 5, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 6, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
];

/** ADMIN: devuelve los horarios de SU organización. Create-on-read: si todavía
 * no existe fila, devuelve los defaults SIN crear nada (recién se persiste
 * cuando el admin guarda por primera vez vía PUT). */
export const getBusinessHours = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const setting = await basePrisma.businessHourSetting.findUnique({
      where: { organizationId },
    });

    res.status(200).json({
      timezone: setting?.timezone ?? DEFAULT_TIMEZONE,
      days: (setting?.days as DaySetting[] | null) ?? DEFAULT_DAYS,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

/** ADMIN: upsert de los horarios de SU organización (scoped por
 * organizationId, nunca por body). El body ya llegó validado/saneado por Zod
 * (validate() reemplaza req.body por el resultado parseado — campos
 * desconocidos quedan afuera, sin mass-assignment posible). */
export const updateBusinessHours = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const data = req.body;

    const setting = await basePrisma.businessHourSetting.upsert({
      where: { organizationId },
      update: data,
      create: { organizationId, ...data },
    });

    res.status(200).json({
      timezone: setting.timezone,
      days: setting.days as unknown as DaySetting[],
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default { getBusinessHours, updateBusinessHours };
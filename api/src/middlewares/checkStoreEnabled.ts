import { Response, NextFunction } from "express";
import { Plan } from "@prisma/client";
import { PublicStoreRequest } from "./tenantBySlug";

// storeEnabled es DERIVADO del Plan, no una columna en Organization (decisión
// #3): evita que el flag y el plan se desincronicen. Correr SIEMPRE después
// de tenantBySlug (necesita req.org.plan, ya resuelto sin query extra).
const STORE_PLANS: Plan[] = ["PRO", "PREMIUM"];

export const checkStoreEnabled = (
  req: PublicStoreRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.org || !STORE_PLANS.includes(req.org.plan)) {
    return res.status(403).json({ error: "STORE_NOT_AVAILABLE" });
  }
  next();
};

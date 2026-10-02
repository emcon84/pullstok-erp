import { Response, NextFunction } from "express";
import { AuthedRequest } from "./authMiddleware";
import balancesLock from "../services/balancesLockService";

/** Requires a valid X-Balances-Token for the authenticated user + org. Use after `authenticate`. */
export const requireBalancesToken = (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    balancesLock.assertToken(req.header("X-Balances-Token"), {
      userId: req.user?.id ?? "",
      organizationId: req.user?.organizationId ?? "",
    });
    next();
  } catch (error: any) {
    return res
      .status(403)
      .json({ error: "BALANCES_LOCKED", message: error?.message ?? "Los saldos están bloqueados" });
  }
};

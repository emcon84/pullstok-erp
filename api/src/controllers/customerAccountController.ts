import { Request, Response } from "express";
import customerAccountService from "../services/customerAccountService";
import balancesLock from "../services/balancesLockService";
import { AuthedRequest } from "../middlewares/authMiddleware";

/**
 * Cuenta corriente de clientes (cuenta-corriente). Controller fino: la lógica
 * vive en customerAccountService; acá solo se mapean los códigos de dominio a HTTP.
 */
const handleError = (error: any, res: Response) => {
  switch (error?.code) {
    case "CUSTOMER_NOT_FOUND":
    case "MOVEMENT_NOT_FOUND":
      return res.status(404).json({ error: error.code, message: error.message });
    // Sin caja abierta para cobrar en efectivo / sin teléfono cargado: payload
    // válido, operación bloqueada.
    case "CASH_SESSION_REQUIRED":
    case "CUSTOMER_PHONE_REQUIRED":
    // Movement edit/delete blocked by business rules (sale-linked charge, closed cash count).
    case "MOVEMENT_IMMUTABLE":
    case "CASH_SESSION_CLOSED":
      return res.status(422).json({ error: error.code, message: error.message });
    case "INVALID_MOVEMENT_AMOUNT":
    case "INVALID_PAYMENT_METHOD":
    case "INVALID_CHARGE_AMOUNT":
      return res.status(400).json({ error: error.code, message: error.message });
    // Balances lock: wrong password, too many attempts, server not configured, locked.
    case "INVALID_BALANCES_PASSWORD":
      return res.status(401).json({ error: error.code, message: error.message });
    case "BALANCES_LOCKED":
      return res.status(403).json({ error: error.code, message: error.message });
    case "BALANCES_RATE_LIMITED":
      return res.status(429).json({ error: error.code, message: error.message });
    case "BALANCES_LOCK_NOT_CONFIGURED":
      return res.status(503).json({ error: error.code, message: error.message });
    // Falló el envío por WhatsApp (Kapso) — no es culpa del payload del cliente.
    case "WHATSAPP_SEND_FAILED":
      return res.status(502).json({ error: error.code, message: error.message });
    default:
      return res.status(500).json({ message: error?.message });
  }
};

const getBalances = async (_req: Request, res: Response) => {
  try {
    res.status(200).json(await customerAccountService.getBalances());
  } catch (error: any) {
    handleError(error, res);
  }
};

const getBalancesSummary = async (_req: Request, res: Response) => {
  try {
    res.status(200).json(await customerAccountService.getBalancesSummary());
  } catch (error: any) {
    handleError(error, res);
  }
};

/** Cobros de cuenta corriente por medio de pago en un rango (query validada por validateQuery). */
const getAccountCollections = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query as unknown as { from: Date; to: Date };
    res.status(200).json(await customerAccountService.getAccountCollections(from, to));
  } catch (error: any) {
    handleError(error, res);
  }
};

/** Exchanges the balances password for a short-lived token. Never echoes the password. */
const unlockBalances = (req: AuthedRequest, res: Response) => {
  try {
    const result = balancesLock.unlock(
      { userId: req.user?.id ?? "", organizationId: req.user?.organizationId ?? "" },
      req.body?.password,
    );
    res.status(200).json(result);
  } catch (error: any) {
    handleError(error, res);
  }
};

const getAccount = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await customerAccountService.getAccount(req.params.id));
  } catch (error: any) {
    handleError(error, res);
  }
};

const registerPayment = async (req: AuthedRequest, res: Response) => {
  try {
    const result = await customerAccountService.registerPayment(
      req.params.id,
      req.body,
      req.user?.id,
    );
    res.status(201).json(result);
  } catch (error: any) {
    handleError(error, res);
  }
};

const registerHistoricalCharge = async (req: AuthedRequest, res: Response) => {
  try {
    const result = await customerAccountService.registerHistoricalCharge(
      req.params.id,
      req.body,
      req.user?.id,
    );
    res.status(201).json(result);
  } catch (error: any) {
    handleError(error, res);
  }
};

const updateMovement = async (req: AuthedRequest, res: Response) => {
  try {
    const result = await customerAccountService.updateMovement(
      req.params.id,
      req.params.movementId,
      req.body,
    );
    res.status(200).json(result);
  } catch (error: any) {
    handleError(error, res);
  }
};

const deleteMovement = async (req: AuthedRequest, res: Response) => {
  try {
    const result = await customerAccountService.deleteMovement(
      req.params.id,
      req.params.movementId,
      req.user?.id,
    );
    res.status(200).json(result);
  } catch (error: any) {
    handleError(error, res);
  }
};

const sendAccountStatementWhatsapp = async (req: Request, res: Response) => {
  try {
    const result = await customerAccountService.sendAccountStatementWhatsapp(req.params.id);
    res.status(200).json(result);
  } catch (error: any) {
    handleError(error, res);
  }
};

// wa.me fallback mientras Kapso está en sandbox: solo arma+sube el PDF.
const getAccountStatementLink = async (req: Request, res: Response) => {
  try {
    const result = await customerAccountService.getAccountStatementLink(req.params.id);
    res.status(200).json(result);
  } catch (error: any) {
    handleError(error, res);
  }
};

export default {
  getBalances,
  getBalancesSummary,
  getAccountCollections,
  unlockBalances,
  getAccount,
  registerPayment,
  registerHistoricalCharge,
  updateMovement,
  deleteMovement,
  sendAccountStatementWhatsapp,
  getAccountStatementLink,
};

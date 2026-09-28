import { Request, Response } from "express";
import customerAccountService from "../services/customerAccountService";
import { AuthedRequest } from "../middlewares/authMiddleware";

/**
 * Cuenta corriente de clientes (cuenta-corriente). Controller fino: la lógica
 * vive en customerAccountService; acá solo se mapean los códigos de dominio a HTTP.
 */
const handleError = (error: any, res: Response) => {
  switch (error?.code) {
    case "CUSTOMER_NOT_FOUND":
      return res.status(404).json({ error: error.code, message: error.message });
    // Sin caja abierta para cobrar en efectivo: payload válido, operación bloqueada.
    case "CASH_SESSION_REQUIRED":
      return res.status(422).json({ error: error.code, message: error.message });
    case "PAYMENT_EXCEEDS_BALANCE":
    case "INVALID_PAYMENT_METHOD":
      return res.status(400).json({ error: error.code, message: error.message });
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

export default { getBalances, getAccount, registerPayment };

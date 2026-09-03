import { Request, Response } from "express";
import {
  listDrafts,
  approveDraft,
  rejectDraft,
} from "../services/whatsappOrderService";

/** GET /whatsapp-orders — lista los borradores pendientes de revisión. */
export const list = async (_req: Request, res: Response) => {
  try {
    const drafts = await listDrafts();
    res.status(200).json(drafts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/** POST /whatsapp-orders/:id/approve — crea el pedido real y marca APPROVED. */
export const approve = async (req: Request, res: Response) => {
  try {
    const { products, totalAmount } = req.body;
    const result = await approveDraft(req.params.id, { products, totalAmount });
    res.status(201).json(result);
  } catch (error: any) {
    if (error?.status === 409) {
      return res.status(409).json({ message: error.message });
    }
    if (error?.status === 404) {
      return res.status(404).json({ message: error.message });
    }
    res.status(400).json({ message: error.message });
  }
};

/** POST /whatsapp-orders/:id/reject — descarta el borrador (no crea pedido). */
export const reject = async (req: Request, res: Response) => {
  try {
    const result = await rejectDraft(req.params.id);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export default { list, approve, reject };

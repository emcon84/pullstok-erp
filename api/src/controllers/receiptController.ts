import { Request, Response } from "express";
import { prisma } from "../config/db";
import getNextSequenceValue from "../services/secuenceService";
import { requireOrganizationId } from "../config/tenantContext";

const createReceipt = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const sequenceNumber = await getNextSequenceValue(organizationId, "receipt");
    const receiptNumber = `REM-${sequenceNumber.toString().padStart(4, "0")}`;

    const receipt = await prisma.receipt.create({
      data: {
        organizationId,
        type: "invoice",
        relatedDocument: req.body.relatedDocument,
        receiptNumber,
      },
    });

    res.status(201).json(receipt);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getReceipts = async (_req: Request, res: Response) => {
  try {
    const receipts = await prisma.receipt.findMany();
    res.status(200).json(receipts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export default {
  createReceipt,
  getReceipts,
};

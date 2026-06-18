import { Request, Response } from "express";
import { prisma } from "../config/db";
import getNextSequenceValue from "../services/secuenceService";

const createReceipt = async (req: Request, res: Response) => {
  try {
    // Obtener el siguiente número secuencial para el comprobante
    const sequenceNumber = await getNextSequenceValue("receipt");
    const receiptNumber = sequenceNumber.toString().padStart(4, "0"); // Formato '0000'

    // Crear un nuevo comprobante
    const receipt = await prisma.receipt.create({
      data: {
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

const getReceipts = async (req: Request, res: Response) => {
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

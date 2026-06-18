import { Router } from 'express';
import receiptController from '../controllers/receiptController';
import { authenticateJWT } from '../middlewares/authMiddleware';

const router = Router();

// Ruta para obtener todos los comprobantes
router.get('/receipts', authenticateJWT, receiptController.getReceipts);

export default router;

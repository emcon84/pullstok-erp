import { Router } from 'express';
import SaleController from '../controllers/salesController';
import { authenticateJWT } from '../middlewares/authMiddleware';

const router = Router();

// Define rutas para ventas
router.post('/', authenticateJWT, SaleController.createSale);
router.get('/', authenticateJWT, SaleController.getAllSales);
router.get('/:id', authenticateJWT, SaleController.getSaleById);

export default router;

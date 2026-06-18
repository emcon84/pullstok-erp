import { Router } from 'express';
import orderController from '../controllers/orderController';
import { authenticateJWT } from '../middlewares/authMiddleware';

const router = Router();

router.post('/', authenticateJWT, orderController.createOrder);
router.get('/', authenticateJWT, orderController.getOrders);
router.get('/:id', authenticateJWT, orderController.getOrderById);
router.put('/:id/status', authenticateJWT, orderController.updateOrderStatus);

export default router;

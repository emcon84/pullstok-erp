import { Router } from 'express';
import customerController from '../controllers/customerController';
import { authenticateJWT } from '../middlewares/authMiddleware';

const router = Router();

router.post('/', authenticateJWT, customerController.createCustomer);
router.get('/', authenticateJWT, customerController.getCustomers);
router.get('/:id', authenticateJWT, customerController.getCustomerById);
router.put('/:id', authenticateJWT, customerController.updateCustomer);
router.delete('/:id', authenticateJWT, customerController.deleteCustomer);

export default router;

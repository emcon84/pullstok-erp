import { Router } from 'express';
import quotationController from '../controllers/quotationController';
import { authenticateJWT } from '../middlewares/authMiddleware';

const router = Router();

router.post('/', authenticateJWT, quotationController.createQuotation);
router.get('/', authenticateJWT, quotationController.getQuotations);
router.get('/:id', authenticateJWT, quotationController.getQuotationById);
router.put('/:id', authenticateJWT, quotationController.updateQuotation);

export default router;

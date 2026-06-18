import { Router } from 'express';
import productController, { uploadProductsCsv } from '../controllers/productController';
import { authenticateJWT } from '../middlewares/authMiddleware';
import { upload } from '../middlewares/uploadMiddleware';

const router = Router();

router.post('/', authenticateJWT, productController.createProduct);
router.post('/bulk', authenticateJWT, productController.bulkUploadProducts);
router.post('/upload-csv', authenticateJWT, upload.single('file'), uploadProductsCsv);
router.get('/', authenticateJWT, productController.getProducts);
router.get('/:id', authenticateJWT, productController.getProductById);
router.put('/:id', authenticateJWT, productController.updateProduct);
router.delete('/:id', authenticateJWT, productController.deleteProduct);

export default router;

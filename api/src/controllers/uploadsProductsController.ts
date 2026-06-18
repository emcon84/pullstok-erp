import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { bulkAddProducts } from '../services/productsService';

export const uploadProductsCsv = async (req: Request, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    // Verifica si req.file.path es ya una ruta correcta
    const filePath = path.resolve(req.file.path); // Utiliza path.resolve para obtener la ruta absoluta

    try {
        console.log('Procesando archivo en:', filePath); // Log para verificar la ruta

        await bulkAddProducts(filePath);
        res.status(201).json({ message: 'Products added successfully' });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ message: 'Error processing file', error });
    } finally {
        // Si quieres eliminar el archivo después de procesarlo, asegúrate de que filePath sea correcto
        // fs.unlink(filePath, (err) => {
        //     if (err) console.error('Failed to delete file:', err);
        // });
    }
};


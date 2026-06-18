import { Request, Response } from 'express';
import SaleService from '../services/salesService';

// Create a new sale
const createSale = async (req: Request, res: Response) => {
    try {
        const saleRequest = req.body;
        console.log(saleRequest)
        const sale = await SaleService.createSale(saleRequest);
        res.status(201).json(sale);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

// Get all sales
const getAllSales = async (req: Request, res: Response) => {
    try {
        const sales = await SaleService.getAllSales();
        res.status(200).json(sales);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Get a single sale by ID
const getSaleById = async (req: Request, res: Response) => {
    try {
        const sale = await SaleService.getSaleById(req.params.id);
        if (sale) {
            res.status(200).json(sale);
        } else {
            res.status(404).json({ message: 'Sale not found' });
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export default {
    createSale,
    getAllSales,
    getSaleById
};

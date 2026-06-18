import { Request, Response } from 'express';
import AuthService from '../services/authServices';

export const register = async (req: Request, res: Response) => {
    const { email, password } = req.body;
    try {
        const user = await AuthService.register(email, password);
        res.status(201).json(user);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;
    try {
        const token = await AuthService.login(email, password);
        res.status(200).json({ token });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

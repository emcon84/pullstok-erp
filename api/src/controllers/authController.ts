import { Request, Response } from "express";
import AuthService from "../services/authServices";
import { AuthedRequest } from "../middlewares/authMiddleware";

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email y contraseña son requeridos" });
  }
  try {
    const result = await AuthService.login(email, password);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(401).json({ message: error.message });
  }
};

export const changePassword = async (req: AuthedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ message: "Faltan la contraseña actual y/o la nueva" });
  }
  try {
    await AuthService.changePassword(req.user!.id, currentPassword, newPassword);
    res.status(200).json({ message: "Contraseña actualizada correctamente" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

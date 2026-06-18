import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

/**
 * Valida `req.body` contra un schema de Zod. Si pasa, reemplaza el body por la
 * versión parseada (sin campos desconocidos → mata el mass-assignment).
 * Si falla, responde 400 con la lista de errores por campo.
 */
export const validate =
  (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "Datos inválidos",
        errors: result.error.issues.map((issue) => ({
          campo: issue.path.join(".") || "(body)",
          error: issue.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };

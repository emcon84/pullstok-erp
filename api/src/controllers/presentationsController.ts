import { Request, Response } from "express";
import {
  replacePresentations,
  enablePresentations,
  disablePresentations,
} from "../services/presentationsService";
import { PresentationError } from "../utils/presentations";
import { emitProductChanged } from "../realtime/socket";
import { requireOrganizationId } from "../config/tenantContext";

// Avisa al catálogo offline del front DESPUÉS de la mutación; un fallo del
// socket nunca rompe la operación HTTP (mismo patrón que manualProductController).
const notifyProductChanged = (productId: string) => {
  try {
    emitProductChanged(requireOrganizationId(), productId, "updated");
  } catch (err: any) {
    console.error("[presentationsController] emitProductChanged falló:", err?.message ?? err);
  }
};

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof PresentationError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
};

// Un único wrapper: ejecuta el use-case, notifica y responde la lista.
const handle =
  (fallback: string, run: (id: string, body: any) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const result = await run(id, req.body);
      notifyProductChanged(id);
      return res.status(200).json(result);
    } catch (error) {
      return handleError(res, error, fallback);
    }
  };

const presentationsController = {
  // PUT /products/:id/presentations
  replace: handle("Error al guardar las presentaciones", replacePresentations),
  // POST /products/:id/presentations/enable
  enable: handle("Error al habilitar las presentaciones", enablePresentations),
  // POST /products/:id/presentations/disable
  disable: handle("Error al deshabilitar las presentaciones", (id) => disablePresentations(id)),
};

export default presentationsController;

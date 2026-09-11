import axios from "axios";
import { API_URL } from "../constants";

/**
 * Cliente API de planillas guardadas (saved planillas). Snapshot inmutable de
 * la planilla mayorista o de la vista previa de actualización de precios, para
 * reabrir/imprimir desde otro dispositivo. Axios + token de localStorage,
 * mismo patrón que productService.
 */

export type SavedPlanillaType = "MAYORISTA" | "ACTUALIZACION";

/** Fila del snapshot guardado (shape genérico para el print reutilizable). */
export interface SavedPlanillaRow {
  brand: string | null;
  gama: string | null;
  tipo: string | null;
  name: string;
  unit: string | null;
  /** MAYORISTA: [precioMayorista, sugerido]. ACTUALIZACION: [newPrice]. */
  prices: number[];
}

export interface SavedPlanilla {
  id: string;
  type: SavedPlanillaType;
  title: string;
  rows: SavedPlanillaRow[];
  createdAt: string;
}

/** Resumen liviano para el listado (sin el snapshot `rows`). */
export interface SavedPlanillaSummary {
  id: string;
  type: SavedPlanillaType;
  title: string;
  createdAt: string;
  rowsCount: number;
}

export interface SavePlanillaPayload {
  type: SavedPlanillaType;
  title: string;
  rows: SavedPlanillaRow[];
}

/** POST /saved-planillas — guarda una planilla. Devuelve el registro creado. */
export const savePlanilla = async (
  payload: SavePlanillaPayload,
): Promise<SavedPlanilla> => {
  try {
    const token = localStorage.getItem("token");
    const response = await axios.post<SavedPlanilla>(
      `${API_URL}/saved-planillas`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "save planilla failed");
    }
    throw new Error("An unknown error occurred");
  }
};

/** GET /saved-planillas — planillas de la org, por createdAt desc (sin rows). */
export const listSavedPlanillas = async (): Promise<{
  items: SavedPlanillaSummary[];
}> => {
  try {
    const token = localStorage.getItem("token");
    const response = await axios.get<{ items: SavedPlanillaSummary[] }>(
      `${API_URL}/saved-planillas`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "list saved planillas failed");
    }
    throw new Error("An unknown error occurred");
  }
};

/** GET /saved-planillas/:id — planilla completa (con `rows`). */
export const getSavedPlanilla = async (id: string): Promise<SavedPlanilla> => {
  try {
    const token = localStorage.getItem("token");
    const response = await axios.get<SavedPlanilla>(
      `${API_URL}/saved-planillas/${id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "get saved planilla failed");
    }
    throw new Error("An unknown error occurred");
  }
};

/** DELETE /saved-planillas/:id — borra una planilla de la org. */
export const deleteSavedPlanilla = async (id: string): Promise<void> => {
  try {
    const token = localStorage.getItem("token");
    await axios.delete(`${API_URL}/saved-planillas/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "delete saved planilla failed");
    }
    throw new Error("An unknown error occurred");
  }
};

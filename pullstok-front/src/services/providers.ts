import axios from "axios";
import { API_URL } from "../constants";

/**
 * Cliente API de proveedores (sdd/alican-wholesale-price-list/providers +
 * ABM administrativo). `listProviders` mantiene su contrato original (lo usan
 * los selectores de planilla: solo necesitan id/name); el resto de los campos
 * son opcionales para no romper esos callers.
 */

export interface Provider {
  id: string;
  name: string;
  code?: string | null;
  taxId?: string | null;
  taxCondition?: string | null;
  address?: string | null;
  locality?: string | null;
  province?: string | null;
  phone?: string | null;
  email?: string | null;
  classification?: string | null;
  /** Referencia contable legada de GFLOW (texto libre); la cuenta real es `account`. */
  accountingRef?: string | null;
  /** Cuenta contable imputable vinculada (plan de cuentas). */
  accountId?: string | null;
  account?: { id: string; code: string; shortCode?: string | null; name: string } | null;
  isActive?: boolean;
  createdAt?: string;
}

/** Payload de alta/edición. En edición, "" limpia el campo (el backend lo pasa a null). */
export interface ProviderInput {
  name?: string;
  code?: string;
  taxId?: string;
  taxCondition?: string;
  address?: string;
  locality?: string;
  province?: string;
  phone?: string;
  email?: string;
  classification?: string;
  accountingRef?: string;
  /** null desvincula la cuenta (solo edición). */
  accountId?: string | null;
  isActive?: boolean;
}

/** GET /providers — proveedores de la org, por nombre asc. */
export const listProviders = async (): Promise<Provider[]> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/providers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const fail = (error: unknown, fallback: string): never => {
  if (axios.isAxiosError(error)) {
    throw new Error(error.response?.data?.message || fallback);
  }
  throw new Error("An unknown error occurred");
};

/** GET /providers para la vista de ABM: devuelve activos e inactivos (el filtro se hace en pantalla). */
export const getProviders = async (): Promise<Provider[]> => {
  try {
    const res = await axios.get<{ items: Provider[] }>(`${API_URL}/providers`, {
      headers: authHeaders(),
    });
    return res.data.items ?? [];
  } catch (error) {
    return fail(error, "Error al cargar los proveedores");
  }
};

export const createProvider = async (data: ProviderInput): Promise<Provider> => {
  try {
    const res = await axios.post<Provider>(`${API_URL}/providers`, data, {
      headers: authHeaders(),
    });
    return res.data;
  } catch (error) {
    return fail(error, "Error al crear el proveedor");
  }
};

export const updateProvider = async ({
  id,
  ...data
}: ProviderInput & { id: string }): Promise<Provider> => {
  try {
    const res = await axios.put<Provider>(`${API_URL}/providers/${id}`, data, {
      headers: authHeaders(),
    });
    return res.data;
  } catch (error) {
    return fail(error, "Error al actualizar el proveedor");
  }
};

export const deleteProvider = async (id: string): Promise<void> => {
  try {
    await axios.delete(`${API_URL}/providers/${id}`, { headers: authHeaders() });
  } catch (error) {
    fail(error, "Error al eliminar el proveedor");
  }
};

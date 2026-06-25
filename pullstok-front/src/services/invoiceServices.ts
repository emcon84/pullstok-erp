import axios from "axios";
import { API_URL } from "../constants";
import {
  CreateInvoiceRequest,
  Invoice,
  UpdateInvoiceRequest,
} from "../models/invoiceModel";

/**
 * Servicio del módulo Facturación de Servicios (sdd/facturacion-servicios,
 * WS4). Consume `/api/invoices/*` (gated PREMIUM-only server-side vía
 * checkInvoicingEnabled — un 403 INVOICING_NOT_AVAILABLE llega como error
 * normal de axios). Mismo patrón try/catch + authHeaders que
 * superadminService.ts.
 */

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.response?.data?.message || fallback;
  }
  return fallback;
};

export const getInvoices = async (): Promise<Invoice[]> => {
  try {
    const response = await axios.get<Invoice[]>(`${API_URL}/invoices`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Error al obtener las facturas"));
  }
};

export const getInvoiceById = async (id: string): Promise<Invoice> => {
  try {
    const response = await axios.get<Invoice>(`${API_URL}/invoices/${id}`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Error al obtener la factura"));
  }
};

export const createInvoice = async (
  data: CreateInvoiceRequest,
): Promise<Invoice> => {
  try {
    const response = await axios.post<Invoice>(`${API_URL}/invoices`, data, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Error al crear la factura"));
  }
};

export const updateInvoice = async ({
  id,
  data,
}: {
  id: string;
  data: UpdateInvoiceRequest;
}): Promise<Invoice> => {
  try {
    const response = await axios.put<Invoice>(
      `${API_URL}/invoices/${id}`,
      data,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Error al editar la factura"));
  }
};

export const deleteInvoice = async (id: string): Promise<void> => {
  try {
    await axios.delete(`${API_URL}/invoices/${id}`, {
      headers: authHeaders(),
    });
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Error al eliminar la factura"));
  }
};

export const issueInvoice = async (id: string): Promise<Invoice> => {
  try {
    const response = await axios.put<Invoice>(
      `${API_URL}/invoices/${id}/issue`,
      {},
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Error al emitir la factura"));
  }
};

export const markInvoiceAsPaid = async (id: string): Promise<Invoice> => {
  try {
    const response = await axios.put<Invoice>(
      `${API_URL}/invoices/${id}/pay`,
      {},
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw new Error(
      extractErrorMessage(error, "Error al marcar la factura como cobrada"),
    );
  }
};

export const cancelInvoice = async (id: string): Promise<Invoice> => {
  try {
    const response = await axios.put<Invoice>(
      `${API_URL}/invoices/${id}/cancel`,
      {},
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Error al cancelar la factura"));
  }
};

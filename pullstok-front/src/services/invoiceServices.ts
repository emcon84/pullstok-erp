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

export interface CreateInvoiceFromSaleBody {
  customerId: string;
  dueDate?: string;
  notes?: string;
}

/**
 * WS3 — Facturar una venta existente.
 * POST /api/sales/:saleId/invoice
 * Respuesta 201: Invoice DRAFT con ítems mapeados automáticamente de la venta.
 * 409 SALE_ALREADY_INVOICED → lanza error con mensaje legible.
 */
export const createInvoiceFromSale = async (
  saleId: string,
  body: CreateInvoiceFromSaleBody,
): Promise<Invoice> => {
  try {
    const response = await axios.post<Invoice>(
      `${API_URL}/sales/${saleId}/invoice`,
      body,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const code = error.response?.data?.code;
      if (code === "SALE_ALREADY_INVOICED") {
        throw new Error("Esta venta ya tiene una factura asociada.");
      }
    }
    throw new Error(
      extractErrorMessage(error, "Error al facturar la venta"),
    );
  }
};

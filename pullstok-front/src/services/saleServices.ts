import axios from "axios";
import { API_URL } from "../constants";
import { Sale, SaleRequest } from "../models/salesModel";

export const createSale = async (
  saleRequest: SaleRequest,
  orderId?: string,
): Promise<void> => {
  const token = localStorage.getItem("token");
  const body = orderId ? { ...saleRequest, orderId } : saleRequest;
  try {
    const response = await axios.post(`${API_URL}/sales`, body, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    console.log("Venta realizada con éxito:", response.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error(
        "Error al realizar la venta:",
        error.response?.data || error.message,
      );
      throw error.response?.data || error.message;
    } else {
      console.error("Error desconocido al realizar la venta:", error);
      throw error;
    }
  }
};

export const getSales = async (branchId?: string): Promise<Sale[]> => {
  const token = localStorage.getItem("token");
  try {
    const response = await axios.get(`${API_URL}/sales`, {
      params: branchId ? { branchId } : undefined,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    console.log("Sales response:", response.data);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error(
        "Error al obtener las ventas:",
        error.response?.data || error.message,
      );
    } else {
      console.error("Error desconocido al obtener las ventas:", error);
    }
    throw error;
  }
};

/** Detalle de una venta puntual (usado por el diálogo de cuenta corriente para
 *  expandir un renglón "Venta" y mostrar qué se vendió). */
export const getSaleById = async (id: string): Promise<Sale> => {
  const token = localStorage.getItem("token");
  try {
    const response = await axios.get(`${API_URL}/sales/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error(
        "Error al obtener el detalle de la venta:",
        error.response?.data || error.message,
      );
      throw error.response?.data || error.message;
    } else {
      console.error("Error desconocido al obtener el detalle de la venta:", error);
      throw error;
    }
  }
};

export const deleteSale = async (id: string): Promise<void> => {
  const token = localStorage.getItem("token");
  try {
    await axios.delete(`${API_URL}/sales/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error(
        "Error al eliminar la venta:",
        error.response?.data || error.message,
      );
      throw error.response?.data || error.message;
    } else {
      console.error("Error desconocido al eliminar la venta:", error);
      throw error;
    }
  }
};

// Puedes agregar más métodos aquí si es necesario

import axios from "axios";
import { API_URL } from "../constants";

export interface BranchData {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  // Punto de venta fiscal de la sucursal (sdd/sucursales-pv-facturacion).
  puntoVenta?: number | null;
  createdAt: string;
}

export interface CreateBranchPayload {
  name: string;
  address?: string;
  phone?: string;
  puntoVenta?: number;
}

export interface UpdateBranchPayload {
  name?: string;
  address?: string;
  phone?: string;
  puntoVenta?: number | null;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

/** Lists active branches in the current organization. */
export const getBranches = async (): Promise<BranchData[]> => {
  try {
    const response = await axios.get<BranchData[]>(`${API_URL}/branches`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error fetching branches",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

/** Creates a new branch in the current organization. */
export const createBranch = async (
  data: CreateBranchPayload,
): Promise<BranchData> => {
  try {
    const response = await axios.post<BranchData>(
      `${API_URL}/branches`,
      data,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error creating branch",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

/** Updates a branch in the current organization. */
export const updateBranch = async (
  id: string,
  data: UpdateBranchPayload,
): Promise<BranchData> => {
  try {
    const response = await axios.put<BranchData>(
      `${API_URL}/branches/${id}`,
      data,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error updating branch",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

/** Toggles a branch's isActive status. */
export const toggleBranchActive = async (
  id: string,
  isActive: boolean,
): Promise<{ message: string }> => {
  try {
    const response = await axios.patch<{ message: string }>(
      `${API_URL}/branches/${id}/active`,
      { isActive },
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error toggling branch status",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

/** Deletes a branch from the current organization. */
export const deleteBranch = async (id: string): Promise<void> => {
  try {
    await axios.delete(`${API_URL}/branches/${id}`, {
      headers: authHeaders(),
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error deleting branch",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

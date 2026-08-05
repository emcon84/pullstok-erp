import axios from "axios";
import { DataItem } from "../types";
import { API_URL } from "../constants";

/** One branch entry of the self-contained stock response (spec A1). */
export interface BranchStockInfo {
  branchId: string;
  branchName: string;
  quantity: number;
  isHeadquarters: boolean;
  canEdit: boolean;
}

/** Self-contained per-branch stock for a product: no GET /branches needed. */
export interface ProductStockResponse {
  productId: string;
  branches: BranchStockInfo[];
}

/**
 * Fetches the stock of a product across every active branch of the org.
 * The response carries the authoritative `canEdit` per branch (server-side
 * role + BranchAssignment), so any authenticated role can render the drawer.
 */
export const getProductStock = async (
  productId: string,
): Promise<ProductStockResponse> => {
  try {
    const token = localStorage.getItem("token");

    const response = await axios.get<ProductStockResponse>(
      `${API_URL}/products/${productId}/stock`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "get product stock failed");
    } else {
      throw new Error("An unknown error occurred");
    }
  }
};

/**
 * Updates the stock quantity of a single branch for a product (spec A2).
 * Server-side authorization decides if the current user may edit that branch.
 */
export const updateBranchStock = async (
  productId: string,
  branchId: string,
  quantity: number,
): Promise<{ branchId: string; quantity: number }> => {
  try {
    const token = localStorage.getItem("token");

    const response = await axios.put<{ branchId: string; quantity: number }>(
      `${API_URL}/products/${productId}/stock/${branchId}`,
      { quantity },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "update branch stock failed");
    } else {
      throw new Error("An unknown error occurred");
    }
  }
};

/** Stock agregado de una sucursal ACTIVA dentro del resumen de la org. */
export interface BranchStockSummary {
  branchId: string;
  branchName: string;
  quantity: number;
  isHeadquarters: boolean;
}

/** Resumen de stock de toda la org (dashboard): total + detalle por sucursal. */
export interface StockSummary {
  total: number;
  branches: BranchStockSummary[];
}

/**
 * Fetches the org-wide stock summary: `total` (all ProductStock rows of the
 * org, active or not) plus the per-branch breakdown of ACTIVE branches.
 */
export const getStockSummary = async (): Promise<StockSummary> => {
  try {
    const token = localStorage.getItem("token");

    const response = await axios.get<StockSummary>(
      `${API_URL}/products/stock-summary`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "get stock summary failed");
    } else {
      throw new Error("An unknown error occurred");
    }
  }
};

/** Server-side pagination envelope (opt-in, only when page + pageSize are sent). */
export interface PaginatedProducts {
  items: DataItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Legacy callers (no page/pageSize) get the plain array; paginated callers
 * (page + pageSize) get the envelope {@link PaginatedProducts}. Overloads let
 * existing consumers keep the `DataItem[]` type without any change.
 */
export function products(
  branchId?: string,
  search?: string,
  category?: string,
): Promise<DataItem[]>;
export function products(
  branchId: string | undefined,
  search: string | undefined,
  category: string | undefined,
  page: number,
  pageSize: number,
): Promise<PaginatedProducts>;
export async function products(
  branchId?: string,
  search?: string,
  category?: string,
  page?: number,
  pageSize?: number,
): Promise<DataItem[] | PaginatedProducts> {
  try {
    const token = localStorage.getItem("token");

    const params: Record<string, string> = {};
    if (branchId) params.branchId = branchId;
    if (search) params.name = search;
    if (category) params.category = category;
    if (page !== undefined && pageSize !== undefined) {
      params.page = String(page);
      params.pageSize = String(pageSize);
    }

    const response = await axios.get(`${API_URL}/products`, {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Error específico de Axios
      throw new Error(error.response?.data?.message || "products failed");
    } else {
      // Error general
      throw new Error("An unknown error occurred");
    }
  }
};
export const createProduct = async (product: DataItem) => {
  try {
    const token = localStorage.getItem("token");

    const response = await axios.post(`${API_URL}/products`, product, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Error específico de Axios
      throw new Error(error.response?.data?.message || "create product failed");
    } else {
      // Error general
      throw new Error("An unknown error occurred");
    }
  }
};

export const updateProduct = async (product: DataItem) => {
  try {
    const token = localStorage.getItem("token");
    const productId = product._id || product.id;

    const response = await axios.put(
      `${API_URL}/products/${productId}`,
      product,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Error específico de Axios
      throw new Error(error.response?.data?.message || "update product failed");
    } else {
      // Error general
      throw new Error("An unknown error occurred");
    }
  }
};

export const deleteProduct = async (productId: string): Promise<void> => {
  try {
    const token = localStorage.getItem("token");

    await axios.delete(`${API_URL}/products/${productId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Error específico de Axios
      throw new Error(error.response?.data?.message || "delete product failed");
    } else {
      // Error general
      throw new Error("An unknown error occurred");
    }
  }
};

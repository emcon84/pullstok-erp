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

/** Complete filter facets: all org categories + variants for the selected category. */
export interface ProductFacets {
  categories: { id: string; name: string }[];
  variants: { name: string; values: string[] }[];
}

/**
 * Fetches the full filter facets (all categories that have products, plus
 * variant groups for the matching category). Independent of the paginated list,
 * so the chips always reflect the complete catalog.
 */
export const getProductFacets = async (
  category?: string,
): Promise<ProductFacets> => {
  try {
    const token = localStorage.getItem("token");

    const params: Record<string, string> = {};
    if (category) params.category = category;

    const response = await axios.get<ProductFacets>(
      `${API_URL}/products/filter-facets`,
      {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "get product facets failed",
      );
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
}
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

// ---------------------------------------------------------------------------
// Bulk price update (sdd/bulk-price-update-selectors)
// ---------------------------------------------------------------------------

/** Override de % sobre una categoría en una corrida masiva. */
export interface CategoryPriceOverride {
  categoryId: string;
  percentage: number;
}

/** Override de % sobre un producto en una corrida masiva. */
export interface ProductPriceOverride {
  productId: string;
  percentage: number;
}

/** Payload compartido por preview (dryRun) y apply de la actualización masiva. */
export interface BulkPriceUpdatePayload {
  brandValues: string[];
  categoryIds: string[];
  excludeProductIds: string[];
  /** Global opcional: sin valor el server resuelve 0 para productos sin override. */
  percentage?: number;
  categoryPercentages: CategoryPriceOverride[];
  productPercentages: ProductPriceOverride[];
}

/** Fila del preview: producto con % efectivo resuelto por el server. */
export interface BulkPricePreviewRow {
  id: string;
  name: string;
  categoryName: string | null;
  brandValues: string[];
  oldPrice: number;
  newPrice: number;
  delta: number;
  effectivePercentage: number;
}

/** Respuesta del preview (dryRun): agregados sobre el set COMPLETO + página. */
export interface BulkPricePreview {
  affected: number;
  previousTotal: number;
  newTotal: number;
  page: number;
  pageSize: number;
  total: number;
  rows: BulkPricePreviewRow[];
}

/** Respuesta del apply: conteo autoritativo re-resuelto en el server. */
export interface BulkPriceApplyResult {
  affected: number;
  previousTotal: number;
  newTotal: number;
}

/**
 * POST /products/bulk-price-update — preview (dryRun=true, paginado por page)
 * o apply (sin flag). Plain fetch + token de localStorage: el endpoint se
 * selecciona por query flag, no por verbo/URL, así que este caso deliberado no
 * usa axios (el resto del archivo sí).
 */
export const bulkPriceUpdate = async (
  payload: BulkPriceUpdatePayload,
  dryRun: boolean,
  page = 1,
  all = false,
): Promise<BulkPricePreview | BulkPriceApplyResult> => {
  const token = localStorage.getItem("token");
  const query = dryRun
    ? all
      ? "?dryRun=true&all=true"
      : `?dryRun=true&page=${page}`
    : "";
  const res = await fetch(`${API_URL}/products/bulk-price-update${query}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "bulk price update failed");
  }
  return res.json();
};

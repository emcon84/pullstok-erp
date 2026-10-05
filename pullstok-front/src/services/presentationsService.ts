import axios from "axios";
import { API_URL } from "../constants";
import type { ProductPresentation } from "../types";

/** One row sent to the replace/enable endpoints (id absent = new presentation). */
export interface PresentationInput {
  id?: string;
  name: string;
  sortOrder: number;
  factor: number;
  price: number;
  wholesalePrice: number | null;
  isActive: boolean;
}

/** Error carrying the server's stable `code` (e.g. PRESENTATION_STOCK_NOT_ZERO). */
export class PresentationsApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message);
    this.name = "PresentationsApiError";
  }
}

const authHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
});

const toApiError = (error: unknown, fallback: string): PresentationsApiError => {
  if (axios.isAxiosError(error)) {
    return new PresentationsApiError(
      error.response?.data?.message || fallback,
      error.response?.data?.code,
      error.response?.status,
    );
  }
  return new PresentationsApiError(
    error instanceof Error ? error.message : "An unknown error occurred",
  );
};

/** Replace-all of a product's presentations; returns the resulting list. */
export const replacePresentations = async (
  productId: string,
  presentations: PresentationInput[],
): Promise<ProductPresentation[]> => {
  try {
    const res = await axios.put<ProductPresentation[]>(
      `${API_URL}/products/${productId}/presentations`,
      { presentations },
      authHeaders(),
    );
    return res.data;
  } catch (error) {
    throw toApiError(error, "replace presentations failed");
  }
};

/** Turns presentations on; existing stock is multiplied by `stockCountedIn`'s factor. */
export const enablePresentations = async (
  productId: string,
  presentations: PresentationInput[],
  stockCountedIn?: string,
) => {
  try {
    const res = await axios.post(
      `${API_URL}/products/${productId}/presentations/enable`,
      stockCountedIn ? { presentations, stockCountedIn } : { presentations },
      authHeaders(),
    );
    return res.data;
  } catch (error) {
    throw toApiError(error, "enable presentations failed");
  }
};

/** Turns presentations off (409 PRESENTATION_STOCK_NOT_ZERO while stock > 0). */
export const disablePresentations = async (productId: string) => {
  try {
    const res = await axios.post(
      `${API_URL}/products/${productId}/presentations/disable`,
      {},
      authHeaders(),
    );
    return res.data;
  } catch (error) {
    throw toApiError(error, "disable presentations failed");
  }
};

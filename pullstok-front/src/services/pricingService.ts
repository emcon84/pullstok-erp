import axios from "axios";
import { API_URL } from "@/constants";

export interface PricingSetting {
  bulkFactor: number;
}

export interface UpdatePricingSettingResult {
  bulkFactor: number;
  recomputed: number;
}

export interface PricingPreviewRow {
  id: string;
  name: string;
  oldKgPrice: number | null;
  newKgPrice: number | null;
}

export interface PricingDryRunResult {
  affected: number;
  sample: PricingPreviewRow[];
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const getPricingSetting = async (): Promise<PricingSetting> => {
  try {
    const response = await axios.get<PricingSetting>(
      `${API_URL}/pricing-settings`,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error al obtener la configuración de precios",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

export const updatePricingSetting = async (
  data: { bulkFactor: number },
  dryRun?: boolean,
): Promise<UpdatePricingSettingResult | PricingDryRunResult> => {
  try {
    const params = dryRun ? "?dryRun=true" : "";
    const response = await axios.put<
      UpdatePricingSettingResult | PricingDryRunResult
    >(`${API_URL}/pricing-settings${params}`, data, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message ||
          "Error al actualizar la configuración de precios",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

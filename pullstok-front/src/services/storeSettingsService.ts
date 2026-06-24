import axios from "axios";
import { API_URL } from "../constants";

export interface StoreBadge {
  title: string;
  subtitle: string;
}

export interface StoreSettings {
  primaryColor: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  tagline: string | null;
  showNewsletter: boolean;
  showBanner: boolean;
  badges: StoreBadge[] | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const getStoreSettings = async (): Promise<StoreSettings> => {
  try {
    const response = await axios.get<StoreSettings>(`${API_URL}/store-settings`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "Error fetching store settings");
    }
    throw new Error("An unknown error occurred");
  }
};

export const updateStoreSettings = async (
  data: Partial<StoreSettings>,
): Promise<StoreSettings> => {
  try {
    const response = await axios.put<StoreSettings>(
      `${API_URL}/store-settings`,
      data,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "Error updating store settings");
    }
    throw new Error("An unknown error occurred");
  }
};

export const publishProduct = async (
  productId: string,
  publishedToStore: boolean,
): Promise<void> => {
  try {
    await axios.patch(
      `${API_URL}/products/${productId}/publish`,
      { publishedToStore },
      { headers: authHeaders() },
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "Error publishing product");
    }
    throw new Error("An unknown error occurred");
  }
};

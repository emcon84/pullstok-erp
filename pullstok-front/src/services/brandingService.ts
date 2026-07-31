import axios from "axios";
import { API_URL } from "../constants";

export interface AppBranding {
  displayName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
}

export type UpdateAppBrandingInput = {
  displayName?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string;
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const getAppBranding = async (): Promise<AppBranding> => {
  try {
    const response = await axios.get<AppBranding>(
      `${API_URL}/app-branding`,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error fetching branding",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

export const updateAppBranding = async (
  data: UpdateAppBrandingInput,
): Promise<AppBranding> => {
  try {
    const response = await axios.put<AppBranding>(
      `${API_URL}/app-branding`,
      data,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error updating branding",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

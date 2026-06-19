import axios from "axios";
import { API_URL } from "../constants";

export type Industry =
  | "FERRETERIA"
  | "KIOSCO"
  | "INDUMENTARIA"
  | "ALMACEN"
  | "OTHER";

export interface Organization {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  industry?: Industry;
  onboardingCompletedAt: string | null;
}

export interface Me {
  id: string;
  email: string;
  role: "SUPERADMIN" | "ADMIN" | "EMPLOYEE";
  organizationId: string;
  mustChangePassword: boolean;
  organization: Organization;
}

export interface Category {
  id: string;
  name: string;
  organizationId: string;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const getMe = async (): Promise<Me> => {
  try {
    const response = await axios.get<Me>(`${API_URL}/auth/me`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "Error fetching me");
    }
    throw new Error("An unknown error occurred");
  }
};

export const updateOrganization = async (
  data: Partial<
    Pick<Organization, "name" | "address" | "phone" | "taxId" | "industry">
  >,
): Promise<Organization> => {
  try {
    const response = await axios.patch<Organization>(
      `${API_URL}/organizations/me`,
      data,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error updating organization",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

export const completeOnboarding = async (): Promise<Organization> => {
  try {
    const response = await axios.post<Organization>(
      `${API_URL}/organizations/me/complete-onboarding`,
      {},
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error completing onboarding",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

export const getSuggestedCategories = async (
  industry: Industry,
): Promise<string[]> => {
  try {
    const response = await axios.get<{ categories: string[] }>(
      `${API_URL}/onboarding/suggested-categories`,
      { headers: authHeaders(), params: { industry } },
    );
    return response.data.categories;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error fetching suggested categories",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

export const createCategories = async (
  names: string[],
): Promise<Category[]> => {
  try {
    const response = await axios.post<Category[]>(
      `${API_URL}/categories`,
      { names },
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error creating categories",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

export const getCategories = async (): Promise<Category[]> => {
  try {
    const response = await axios.get<Category[]>(`${API_URL}/categories`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error fetching categories",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

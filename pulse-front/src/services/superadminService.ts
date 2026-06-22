import axios from "axios";
import { API_URL } from "../constants";
import { Plan } from "./onboardingService";

/**
 * Servicio del panel superadmin (sdd/planes-y-billing, Fase 6). Consume los
 * endpoints `/superadmin/organizations/*` implementados en Fase 3 — todos
 * requieren rol SUPERADMIN, validado server-side (ver superadminRoutes.ts en
 * api/). Mismo patrón axios + authHeaders que onboardingService.ts.
 */

export interface SuperadminOrganization {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  plan: Plan;
  paidUntil: string | null;
  isPaymentOverdue: boolean;
  _count: {
    users: number;
    products: number;
  };
}

export interface CreateOrganizationPayload {
  organizationName: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  plan?: Plan;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const getOrganizations = async (): Promise<SuperadminOrganization[]> => {
  try {
    const response = await axios.get<SuperadminOrganization[]>(
      `${API_URL}/superadmin/organizations`,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error fetching organizations",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

export const createOrganization = async (
  data: CreateOrganizationPayload,
): Promise<SuperadminOrganization> => {
  try {
    const response = await axios.post<SuperadminOrganization>(
      `${API_URL}/superadmin/organizations`,
      data,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error creating organization",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

export const updateOrganizationPlan = async ({
  id,
  plan,
}: {
  id: string;
  plan: Plan;
}): Promise<SuperadminOrganization> => {
  try {
    const response = await axios.patch<SuperadminOrganization>(
      `${API_URL}/superadmin/organizations/${id}/plan`,
      { plan },
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error updating organization plan",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

export const registerOrganizationBilling = async (
  id: string,
): Promise<SuperadminOrganization> => {
  try {
    const response = await axios.patch<SuperadminOrganization>(
      `${API_URL}/superadmin/organizations/${id}/billing`,
      { action: "pay" },
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error registering payment",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

export const setOrganizationActive = async ({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}): Promise<SuperadminOrganization> => {
  try {
    const response = await axios.patch<SuperadminOrganization>(
      `${API_URL}/superadmin/organizations/${id}/active`,
      { isActive },
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message ||
          "Error updating organization active state",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

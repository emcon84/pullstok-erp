import axios from "axios";
import { API_URL } from "../constants";
import { Plan } from "./onboardingService";

// ── Types shared with userService ───────────────────────────

export interface OrgUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateOrgUserPayload {
  email: string;
  password: string;
  role?: string;
}

// ── Organization types ──────────────────────────────────────

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

export const clearOrganizationConversations = async (
  id: string,
): Promise<{ deleted: number }> => {
  try {
    const response = await axios.delete<{ deleted: number }>(
      `${API_URL}/superadmin/organizations/${id}/conversations`,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error clearing conversations",
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

// ── SUPERADMIN: Org User CRUD ────────────────────────────────

/** Lists all users in a specific organization. */
export const getOrgUsers = async (orgId: string): Promise<OrgUser[]> => {
  try {
    const response = await axios.get<OrgUser[]>(
      `${API_URL}/superadmin/organizations/${orgId}/users`,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error fetching org users",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

/** Creates a user in a specific organization. */
export const createOrgUser = async (
  orgId: string,
  data: CreateOrgUserPayload,
): Promise<OrgUser> => {
  try {
    const response = await axios.post<OrgUser>(
      `${API_URL}/superadmin/organizations/${orgId}/users`,
      data,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error creating org user",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

/** Toggles a user's isActive status in a specific organization. */
export const setOrgUserActive = async (
  orgId: string,
  userId: string,
  isActive: boolean,
): Promise<{ message: string }> => {
  try {
    const response = await axios.patch<{ message: string }>(
      `${API_URL}/superadmin/organizations/${orgId}/users/${userId}/active`,
      { isActive },
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error updating org user status",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

/** SUPERADMIN: deletes a user from an organization. */
export const deleteOrgUser = async (
  orgId: string,
  userId: string,
): Promise<void> => {
  try {
    await axios.delete(
      `${API_URL}/superadmin/organizations/${orgId}/users/${userId}`,
      { headers: authHeaders() },
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error deleting org user",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

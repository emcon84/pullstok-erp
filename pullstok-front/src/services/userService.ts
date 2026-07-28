import axios from "axios";
import { API_URL } from "../constants";

export interface UserData {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateUserPayload {
  email?: string;
  username?: string;
  name?: string;
  phone?: string;
  address?: string;
  password: string;
  role?: string;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

/** Lists all users in the current user's organization. */
export const getUsers = async (): Promise<UserData[]> => {
  try {
    const response = await axios.get<UserData[]>(`${API_URL}/users`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error fetching users",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

/** Creates a new user in the current user's organization. */
export const createUser = async (
  data: CreateUserPayload,
): Promise<UserData> => {
  try {
    const response = await axios.post<UserData>(
      `${API_URL}/users`,
      data,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error creating user",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

/** Toggles a user's isActive status in the current organization. */
export const setUserActive = async (
  id: string,
  isActive: boolean,
): Promise<{ message: string }> => {
  try {
    const response = await axios.patch<{ message: string }>(
      `${API_URL}/users/${id}/active`,
      { isActive },
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error updating user status",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

/** Deletes a user from the current organization. */
export const deleteUser = async (id: string): Promise<void> => {
  try {
    await axios.delete(`${API_URL}/users/${id}`, {
      headers: authHeaders(),
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error deleting user",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

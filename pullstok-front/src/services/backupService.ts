import axios from "axios";
import { API_URL } from "../constants";

export interface BackupInfo {
  url: string;
  date: string;
  size: number;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

/**
 * Fetches a presigned download URL for the current organization's
 * latest daily backup.
 *
 * Requires ADMIN role — non-admin users get 403.
 */
export const getLatestBackup = async (): Promise<BackupInfo> => {
  try {
    const response = await axios.get<BackupInfo>(
      `${API_URL}/backups/latest`,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error fetching backup download link",
      );
    }
    throw new Error("An unknown error occurred");
  }
};

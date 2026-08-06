import axios from "axios";
import { API_URL } from "../constants";

// Config de horario comercial (business-hours-access). Espejo de
// storeSettingsService: misma firma axios + headers, 1:1 con la org. El
// backend devuelve los defaults si la org nunca guardó (create-on-read).
export interface BusinessHoursDay {
  day: number; // 0 (domingo) .. 6 (sábado)
  enabled: boolean;
  open: string; // "HH:MM" (zero-padded)
  close: string; // "HH:MM" (zero-padded)
}

export interface BusinessHoursSettings {
  timezone: string;
  days: BusinessHoursDay[];
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const getBusinessHours = async (): Promise<BusinessHoursSettings> => {
  try {
    const response = await axios.get<BusinessHoursSettings>(
      `${API_URL}/business-hours`,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error al obtener el horario comercial",
      );
    }
    throw new Error("Ocurrió un error desconocido");
  }
};

export const updateBusinessHours = async (
  data: BusinessHoursSettings,
): Promise<BusinessHoursSettings> => {
  try {
    const response = await axios.put<BusinessHoursSettings>(
      `${API_URL}/business-hours`,
      data,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || "Error al guardar el horario comercial",
      );
    }
    throw new Error("Ocurrió un error desconocido");
  }
};

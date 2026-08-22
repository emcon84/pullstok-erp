import axios from "axios";
import { API_URL } from "../constants";

export type ArcaEnvironment = "HOMOLOGACION" | "PRODUCCION";

/**
 * Configuración ARCA del emisor (sdd/arca-facturacion-electronica + item 6
 * de deuda técnica: UI de config ARCA, que antes solo se podía por API).
 * 1:1 con la organización; los certificados NUNCA van en la DB, solo rutas.
 */
export interface ArcaSettings {
  cuitEmisor: string;
  padronCuit: string | null;
  puntoVenta: number | null;
  environment: ArcaEnvironment;
  certPath: string;
  keyPath: string;
  enabled: boolean;
}

export type UpdateArcaSettingsInput = Partial<
  Pick<
    ArcaSettings,
    | "cuitEmisor"
    | "padronCuit"
    | "puntoVenta"
    | "environment"
    | "certPath"
    | "keyPath"
    | "enabled"
  >
>;

/** Estado del gate ARCA (lo consume la UI para saber si está habilitado). */
export interface ArcaEnabled {
  enabled: boolean;
  cuitEmisor?: string | null;
  puntoVenta?: number | null;
  environment?: ArcaEnvironment | null;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const getArcaSettings = async (): Promise<ArcaSettings> => {
  try {
    const response = await axios.get<ArcaSettings>(`${API_URL}/arca-settings`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "Error al leer config ARCA");
    }
    throw new Error("Error desconocido al leer config ARCA");
  }
};

export const updateArcaSettings = async (
  data: UpdateArcaSettingsInput,
): Promise<ArcaSettings> => {
  try {
    const response = await axios.put<ArcaSettings>(`${API_URL}/arca-settings`, data, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "Error al guardar config ARCA");
    }
    throw new Error("Error desconocido al guardar config ARCA");
  }
};

export const getArcaEnabled = async (): Promise<ArcaEnabled> => {
  try {
    const response = await axios.get<ArcaEnabled>(`${API_URL}/arca/check-enabled`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "Error al consultar estado ARCA");
    }
    throw new Error("Error desconocido al consultar estado ARCA");
  }
};

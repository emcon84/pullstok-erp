import axios from "axios";
import { API_URL } from "../constants";

export type ArcaEnvironment = "HOMOLOGACION" | "PRODUCCION";

/**
 * Configuración ARCA del emisor (sdd/arca-facturacion-electronica + item 6
 * de deuda técnica: UI de config ARCA, que antes solo se podía por API).
 * 1:1 con la organización. certPath/keyPath quedaron @deprecated
 * (sdd/arca-certificados-self-service) — el certificado real vive cifrado en
 * ArcaCertificate, ver getArcaCertificates/uploadArcaCertificate más abajo.
 */
export interface ArcaSettings {
  cuitEmisor: string;
  padronCuit: string | null;
  puntoVenta: number | null;
  environment: ArcaEnvironment;
  /** @deprecated ver ArcaCertificateMetadata */
  certPath: string;
  /** @deprecated ver ArcaCertificateMetadata */
  keyPath: string;
  enabled: boolean;
}

export type UpdateArcaSettingsInput = Partial<
  Pick<ArcaSettings, "cuitEmisor" | "padronCuit" | "puntoVenta" | "environment" | "enabled">
>;

/** Metadata parseada de un certificado cargado — nunca viaja el cert/la clave. */
export interface ArcaCertificateMetadata {
  environment: ArcaEnvironment;
  subjectCn: string | null;
  subjectCuit: string | null;
  issuer: string;
  validFrom: string;
  validTo: string;
  isExpired: boolean;
  uploadedAt: string;
  uploadedByUserId: string;
}

export type ArcaCertificatesByEnvironment = Record<
  ArcaEnvironment,
  ArcaCertificateMetadata | null
>;

export type ArcaService = "wsfe" | "ws_sr_padron_a4";
export type ArcaServiceCheckStatus = "habilitado" | "no_habilitado" | "error";

export interface ArcaServiceCheckResult {
  status: ArcaServiceCheckStatus;
  message: string;
  checkedAt: string;
}

/** Error del cooldown de verify-service (429): el caller lee retryAfterSeconds
 * para mostrar cuánto falta antes de reintentar. */
export class ArcaVerifyCooldownError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "ArcaVerifyCooldownError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

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

/** Metadata (nunca bytes) de los certificados cargados, por ambiente. */
export const getArcaCertificates = async (): Promise<ArcaCertificatesByEnvironment> => {
  try {
    const response = await axios.get<ArcaCertificatesByEnvironment>(
      `${API_URL}/arca-settings/certificates`,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "Error al leer los certificados ARCA");
    }
    throw new Error("Error desconocido al leer los certificados ARCA");
  }
};

/** Sube (o rota) el par cert+key de un ambiente. Nunca se vuelve a leer la
 * clave privada después de esto — solo queda su metadata. */
export const uploadArcaCertificate = async (
  environment: ArcaEnvironment,
  certFile: File,
  keyFile: File,
): Promise<ArcaCertificateMetadata> => {
  try {
    const formData = new FormData();
    formData.append("cert", certFile);
    formData.append("key", keyFile);
    const response = await axios.post<ArcaCertificateMetadata>(
      `${API_URL}/arca-settings/certificates/${environment}`,
      formData,
      { headers: { ...authHeaders(), "Content-Type": "multipart/form-data" } },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "Error al subir el certificado");
    }
    throw new Error("Error desconocido al subir el certificado");
  }
};

/** Login WSAA de prueba contra el ambiente activo para inferir si `service`
 * está habilitado en AFIP. Rate-limitado server-side (5 min por servicio) —
 * un 429 se traduce a ArcaVerifyCooldownError con los segundos restantes. */
export const verifyArcaService = async (
  service: ArcaService,
): Promise<ArcaServiceCheckResult> => {
  try {
    const response = await axios.post<ArcaServiceCheckResult>(
      `${API_URL}/arca-settings/verify-service`,
      { service },
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new ArcaVerifyCooldownError(
          error.response.data?.message || "Ya se verificó este servicio hace poco.",
          error.response.data?.retryAfterSeconds ?? 60,
        );
      }
      throw new Error(error.response?.data?.message || "Error al verificar el servicio");
    }
    throw new Error("Error desconocido al verificar el servicio");
  }
};

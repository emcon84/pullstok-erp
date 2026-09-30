import axios from "axios";
import { API_URL } from "../constants";

/**
 * Impresión desde el celular (relay por servidor): impresoras, equipos (agentes)
 * y jobs de impresión (api/src/routes/printerRoutes.ts, printJobRoutes.ts).
 */

export interface PrinterAgentSummary {
  id: string;
  name: string;
  lastSeenAt: string | null;
  /** Impresoras de Windows que el agente reportó en su último latido. */
  localPrinters: string[] | null;
}

export interface PrinterData {
  id: string;
  name: string;
  branchId: string | null;
  agentId: string | null;
  /** Nombre de la impresora en Windows (el que reportó el agente). */
  localName: string | null;
  isActive: boolean;
  agentOnline: boolean;
  agent: PrinterAgentSummary | null;
}

export interface PrintAgentData extends PrinterAgentSummary {
  paired: boolean;
  online: boolean;
}

export interface PrinterPayload {
  name?: string;
  branchId?: string | null;
  agentId?: string | null;
  localName?: string | null;
  isActive?: boolean;
}

export interface PairingCodeResult {
  agentId: string;
  code: string;
  expiresAt: string;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const toError = (error: unknown, fallback: string): Error => {
  if (axios.isAxiosError(error)) {
    return new Error(error.response?.data?.message || fallback);
  }
  return new Error(fallback);
};

/** ADMIN/MANAGEMENT: impresoras de la organización con el estado online de su agente. */
export const getPrinters = async (): Promise<PrinterData[]> => {
  try {
    const res = await axios.get<PrinterData[]>(`${API_URL}/printers`, { headers: authHeaders() });
    return res.data;
  } catch (error) {
    throw toError(error, "Error al obtener las impresoras");
  }
};

/** ADMIN/MANAGEMENT: equipos (agentes) emparejados y sus impresoras de Windows. */
export const getPrintAgents = async (): Promise<PrintAgentData[]> => {
  try {
    const res = await axios.get<PrintAgentData[]>(`${API_URL}/printers/agents`, {
      headers: authHeaders(),
    });
    return res.data;
  } catch (error) {
    throw toError(error, "Error al obtener los equipos");
  }
};

export const createPrinter = async (data: PrinterPayload): Promise<PrinterData> => {
  try {
    const res = await axios.post<PrinterData>(`${API_URL}/printers`, data, { headers: authHeaders() });
    return res.data;
  } catch (error) {
    throw toError(error, "Error al crear la impresora");
  }
};

export const updatePrinter = async (id: string, data: PrinterPayload): Promise<PrinterData> => {
  try {
    const res = await axios.put<PrinterData>(`${API_URL}/printers/${id}`, data, {
      headers: authHeaders(),
    });
    return res.data;
  } catch (error) {
    throw toError(error, "Error al actualizar la impresora");
  }
};

export const deletePrinter = async (id: string): Promise<void> => {
  try {
    await axios.delete(`${API_URL}/printers/${id}`, { headers: authHeaders() });
  } catch (error) {
    throw toError(error, "Error al eliminar la impresora");
  }
};

/** Crea un equipo pendiente y su código de emparejamiento (se ve una sola vez; vence en 10 min). */
export const createPairingCode = async (name: string): Promise<PairingCodeResult> => {
  try {
    const res = await axios.post<PairingCodeResult>(
      `${API_URL}/printers/pairing-codes`,
      { name },
      { headers: authHeaders() },
    );
    return res.data;
  } catch (error) {
    throw toError(error, "Error al generar el código de emparejamiento");
  }
};

// ---------- Impresión desde el celular (cualquier rol operativo) ----------

/** Impresora activa tal como la ve un vendedor/cajero (sin datos del equipo). */
export interface ActivePrinter {
  id: string;
  name: string;
  branchId: string | null;
  agentOnline: boolean;
}

export type PrintJobStatus = "PENDING" | "PRINTED" | "ERROR" | "EXPIRED";

export interface CreatedPrintJob {
  id: string;
  status: PrintJobStatus;
  expiresAt: string;
}

export interface PrintJobInfo {
  id: string;
  printerId: string;
  status: PrintJobStatus;
  errorMessage: string | null;
  createdAt?: string;
  expiresAt?: string;
  completedAt?: string | null;
}

/** Impresoras activas de la org para elegir a dónde imprimir (VENDEDOR/CASHIER/ADMIN/MANAGEMENT). */
export const getActivePrinters = async (): Promise<ActivePrinter[]> => {
  try {
    const res = await axios.get<ActivePrinter[]>(`${API_URL}/print-jobs/printers`, {
      headers: authHeaders(),
    });
    return res.data;
  } catch (error) {
    throw toError(error, "Error al obtener las impresoras");
  }
};

/** Encola el ticket (bytes ESC/POS en base64) para la impresora elegida. */
export const createPrintJob = async (
  printerId: string,
  payloadBase64: string,
): Promise<CreatedPrintJob> => {
  try {
    const res = await axios.post<CreatedPrintJob>(
      `${API_URL}/print-jobs`,
      { printerId, payloadBase64 },
      { headers: authHeaders() },
    );
    return res.data;
  } catch (error) {
    throw toError(error, "No se pudo enviar el ticket a la impresora");
  }
};

/** Estado de un job (el celular lo consulta por polling). */
export const getPrintJob = async (id: string): Promise<PrintJobInfo> => {
  try {
    const res = await axios.get<PrintJobInfo>(`${API_URL}/print-jobs/${id}`, {
      headers: authHeaders(),
    });
    return res.data;
  } catch (error) {
    throw toError(error, "No se pudo consultar el estado de la impresión");
  }
};

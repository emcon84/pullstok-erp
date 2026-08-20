import axios from "axios";
import { API_URL } from "../constants";
import {
  CashSession,
  CashCloseResult,
  OpenCashPayload,
  CloseCashPayload,
} from "../models/cashSessionModel";

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

/** Abre una caja (fondo inicial, sucursal asignada o explícita). */
export const openCashSession = async (
  payload: OpenCashPayload,
): Promise<CashSession> => {
  const response = await axios.post<CashSession>(`${API_URL}/cash-sessions`, payload, {
    headers: authHeaders(),
  });
  return response.data;
};

/** Cierra una caja con arqueo (conteo real por método vs esperado). */
export const closeCashSession = async (
  id: string,
  payload: CloseCashPayload,
): Promise<CashCloseResult> => {
  const response = await axios.post<CashCloseResult>(
    `${API_URL}/cash-sessions/${id}/close`,
    payload,
    { headers: authHeaders() },
  );
  return response.data;
};

/** Devuelve la sesión OPEN actual del usuario (o por branch para gestión). */
export const getCurrentCashSession = async (
  branchId?: string,
): Promise<CashSession | null> => {
  const response = await axios.get<CashSession | null>(`${API_URL}/cash-sessions/current`, {
    params: branchId ? { branchId } : undefined,
    headers: authHeaders(),
  });
  return response.data;
};

/** Detalle de una sesión (dueño o gestión). */
export const getCashSession = async (id: string): Promise<CashSession> => {
  const response = await axios.get<CashSession>(`${API_URL}/cash-sessions/${id}`, {
    headers: authHeaders(),
  });
  return response.data;
};

/** Listado de sesiones (operativos solo las propias; gestión todas). */
export const getCashSessions = async (params?: {
  status?: string;
  branchId?: string;
}): Promise<CashSession[]> => {
  const response = await axios.get<{ items: CashSession[] }>(`${API_URL}/cash-sessions`, {
    params,
    headers: authHeaders(),
  });
  return response.data.items ?? response.data;
};

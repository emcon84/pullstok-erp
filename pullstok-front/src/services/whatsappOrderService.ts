import axios from 'axios';
import { Order } from '../models/orderModel';
import {
  WhatsAppOrderDraft,
  ApproveDraftPayload,
} from '../models/whatsappOrderModel';
import { API_URL } from '../constants';

// Headers de autenticación: mismo patrón que los demás servicios del ERP.
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

// Lista los borradores de pedido de WhatsApp pendientes de revisión.
export const getWhatsappDrafts = async (): Promise<WhatsAppOrderDraft[]> => {
  const response = await axios.get<WhatsAppOrderDraft[]>(
    `${API_URL}/whatsapp-orders`,
    { headers: authHeaders() },
  );
  return response.data;
};

// Aprueba un borrador: el backend crea el pedido real (source WHATSAPP) y
// devuelve el pedido creado + el borrador actualizado (status APPROVED).
export const approveWhatsappDraft = async (
  id: string,
  data: ApproveDraftPayload,
): Promise<{ order: Order; draft: WhatsAppOrderDraft }> => {
  const response = await axios.post<{ order: Order; draft: WhatsAppOrderDraft }>(
    `${API_URL}/whatsapp-orders/${id}/approve`,
    data,
    { headers: authHeaders() },
  );
  return response.data;
};

// Rechaza un borrador (no crea ningún pedido).
export const rejectWhatsappDraft = async (
  id: string,
): Promise<{ ok: boolean }> => {
  const response = await axios.post<{ ok: boolean }>(
    `${API_URL}/whatsapp-orders/${id}/reject`,
    {},
    { headers: authHeaders() },
  );
  return response.data;
};

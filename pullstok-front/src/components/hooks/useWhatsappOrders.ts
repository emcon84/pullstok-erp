import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getWhatsappDrafts,
  approveWhatsappDraft,
  rejectWhatsappDraft,
  sendWhatsappConfirmation,
} from '../../services/whatsappOrderService';
import {
  WhatsAppOrderDraft,
  ApproveDraftPayload,
} from '../../models/whatsappOrderModel';
import { Order } from '../../models/orderModel';

// Lista los borradores de pedido de WhatsApp pendientes de revisión.
export const useWhatsappDrafts = () => {
  const { data, error, isLoading } = useQuery<WhatsAppOrderDraft[], Error>({
    queryKey: ['whatsapp-drafts'],
    queryFn: getWhatsappDrafts,
  });

  return {
    drafts: data || [],
    loading: isLoading,
    error,
  };
};

// Aprobación: invalida ['whatsapp-drafts'] (el borrador deja de estar pendiente)
// y ['orders'] (se creó un pedido nuevo / la bandeja de Pedidos cambia).
export const useApproveDraft = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    { order: Order; draft: WhatsAppOrderDraft },
    Error,
    { id: string; data: ApproveDraftPayload }
  >({
    mutationFn: ({ id, data }) => approveWhatsappDraft(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-drafts'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  return {
    approve: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
  };
};

// Rechazo: solo invalida la lista de borradores (no se crea ningún pedido).
export const useRejectDraft = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<{ ok: boolean }, Error, string>({
    mutationFn: rejectWhatsappDraft,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-drafts'] });
    },
  });

  return {
    reject: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
  };
};

// Envío de la confirmación al cliente. No invalida queries: solo entrega un
// mensaje por WhatsApp, no cambia el estado del borrador ni de los pedidos.
export const useSendConfirmation = () => {
  const mutation = useMutation<{ ok: boolean }, Error, { id: string; message: string }>({
    mutationFn: ({ id, message }) => sendWhatsappConfirmation(id, message),
  });

  return {
    send: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
  };
};

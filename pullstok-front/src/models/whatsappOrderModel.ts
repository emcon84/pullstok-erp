import { Customer } from "./customerModel";

// Conversación de la que nació el borrador (lo mínimo para mostrar el canal/nº).
export interface WhatsappDraftConversation {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  channel: string;
  status: string;
}

// Línea de un pedido multi-producto capturado por el bot (FASE 6). Cada entrada
// puede referir a un producto del catálogo (productId/productName) o ser un
// requerimiento libre que el vendedor tendrá que confirmar (productName vacío).
export interface DraftItem {
  productId?: string | null;
  productName?: string | null;
  type: string;
  quantity?: number | null;
  amount?: number | null;
  detail?: string | null;
  total?: number | null;
  marca?: string | null;
  especie?: string | null;
  etapa?: string | null;
  peso?: string | null;
  observacion?: string | null;
}

// Borrador de pedido capturado por el bot de WhatsApp (FASE 3). Se lista en la
// vista "Pedidos WhatsApp" y se aprueba creando el pedido real en el backend.
export interface WhatsAppOrderDraft {
  id: string;
  organizationId: string;
  conversationId: string;
  phone: string;
  contactName?: string | null;
  customerId?: string | null;
  orderType: string;
  productText?: string | null;
  quantityKg?: number | null;
  amount?: number | null;
  address?: string | null;
  paymentMethod: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  orderId?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: Customer | null;
  conversation?: WhatsappDraftConversation;
  // FASE 6 — multi-producto + observación del pedido.
  items?: DraftItem[] | null;
  notes?: string | null;
}

// Payload de aprobación: el vendedor arma los productos reales (mismo shape que
// CreateOrder.products) y el backend crea el pedido + marca el borrador APPROVED.
export interface ApproveDraftPayloadProduct {
  productId: string;
  quantity: number;
  price: number;
}

export interface ApproveDraftPayload {
  products: ApproveDraftPayloadProduct[];
  totalAmount: number;
}

import { Customer } from "./customerModel";

/**
 * Módulo Facturación de Servicios (sdd/facturacion-servicios, WS4).
 * Tipos del dominio Invoice — calcan el modelo Prisma del backend
 * (api/prisma/schema.prisma) y la forma de respuesta de
 * invoiceController.ts. Sin productId: conceptos libres (description).
 */

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PENDING_CAE" | "CANCELLED";
export type PaymentStatus = "PENDING" | "PAID" | "OVERDUE";

/**
 * Estado fiscal de una factura emitida contra ARCA (sdd/arca-facturacion-
 * electronica, spec 6). El número fiscal visible es puntoVenta-cbteNro; el
 * number interno FAC-XXXX queda como referencia de trazabilidad.
 */
export interface FiscalData {
  /** Código ARCA del comprobante: "1"=Factura A, "6"=Factura B. */
  tipoComprobante?: string | null;
  /** Punto de venta fiscal configurado en ArcaSetting. */
  puntoVenta?: number | null;
  /** Correlativo fiscal reservado (autoridad: FECompUltimoAutorizado). */
  cbteNro?: number | null;
  /** CAE otorgado por ARCA (null = aún no emitido fiscalmente). */
  cae?: string | null;
  caeVencimiento?: string | null;
  /** Error de la última emisión fiscal (para reintento/diagnóstico). */
  arcaErrorCode?: string | null;
  arcaErrorMessage?: string | null;
  arcaAttempts?: number;
  docTipoReceptor?: number | null;
  docNroReceptor?: string | null;
  condicionIvaReceptorId?: number | null;
}

export interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineTotal?: number; // snapshot del backend: quantity * unitPrice (sin IVA)
}

export interface Invoice {
  id: string;
  organizationId?: string;
  // OPCIONAL desde sdd/arca-facturacion-electronica: la Factura B de
  // mostrador sin identificar va sin Customer asociado (DocTipo 99/0).
  customerId: string | null;
  customer: Customer | null;
  number?: string | null;
  issueDate: string;
  dueDate?: string | null;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  // Campos fiscales ARCA (spec 6): presentes si hubo emisión fiscal.
  tipoComprobante?: string | null;
  puntoVenta?: number | null;
  cbteNro?: number | null;
  cae?: string | null;
  caeVencimiento?: string | null;
  arcaErrorCode?: string | null;
  arcaErrorMessage?: string | null;
  arcaAttempts?: number;
  docTipoReceptor?: number | null;
  docNroReceptor?: string | null;
  condicionIvaReceptorId?: number | null;
}

export interface InvoiceItemRequest {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface CreateInvoiceRequest {
  customerId?: string;
  dueDate?: string;
  notes?: string;
  items: InvoiceItemRequest[];
}

export interface UpdateInvoiceRequest {
  customerId?: string;
  dueDate?: string;
  notes?: string;
  items?: InvoiceItemRequest[];
}

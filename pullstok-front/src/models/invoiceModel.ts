import { Customer } from "./customerModel";

/**
 * Módulo Facturación de Servicios (sdd/facturacion-servicios, WS4).
 * Tipos del dominio Invoice — calcan el modelo Prisma del backend
 * (api/prisma/schema.prisma) y la forma de respuesta de
 * invoiceController.ts. Sin productId: conceptos libres (description).
 */

export type InvoiceStatus = "DRAFT" | "ISSUED" | "CANCELLED";
export type PaymentStatus = "PENDING" | "PAID" | "OVERDUE";

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
  customerId: string;
  customer: Customer;
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
}

export interface InvoiceItemRequest {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface CreateInvoiceRequest {
  customerId: string;
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

// Helper PURO (sin Express/Prisma) para el cálculo fiscal de una factura.
// Separado del controller a propósito (única desviación intencional del
// patrón inline de Quotation): es lógica fiscal crítica y necesita poder
// testearse aislada, sin mockear DB ni Express.

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface InvoiceLineCalculated extends InvoiceLineInput {
  lineTotal: number;
}

export interface InvoiceTotals {
  items: InvoiceLineCalculated[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

/**
 * Calcula el snapshot de cada línea (lineTotal = quantity * unitPrice, SIN
 * IVA) y deriva subtotal/taxAmount/totalAmount sumando todas las líneas.
 * Soporta alícuotas mixtas por línea (taxRate puede variar ítem a ítem).
 */
export const calculateInvoiceTotals = (
  items: InvoiceLineInput[],
): InvoiceTotals => {
  const calculatedItems: InvoiceLineCalculated[] = items.map((item) => ({
    ...item,
    lineTotal: item.quantity * item.unitPrice,
  }));

  const subtotal = calculatedItems.reduce(
    (acc, item) => acc + item.lineTotal,
    0,
  );
  const taxAmount = calculatedItems.reduce(
    (acc, item) => acc + (item.lineTotal * item.taxRate) / 100,
    0,
  );
  const totalAmount = subtotal + taxAmount;

  return { items: calculatedItems, subtotal, taxAmount, totalAmount };
};

export default calculateInvoiceTotals;

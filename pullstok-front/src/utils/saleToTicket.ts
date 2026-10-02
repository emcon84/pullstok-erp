import { round2 } from "@/lib/money";
import { isFreeLineSaleItem } from "@/lib/freeLine";
import { PAYMENT_METHOD_LABELS } from "@/models/cashSessionModel";
import type { Sale } from "@/models/salesModel";
import {
  buildSaleTicket,
  type SaleTicket,
  type SaleTicketItem,
  type TicketCompany,
} from "@/utils/saleTicket";

/**
 * Venta GUARDADA → SaleTicket para REIMPRIMIR. Mismo layout que el ticket del
 * momento de la venta (reusa buildSaleTicket para las líneas), pero:
 *  - la fecha es la ORIGINAL de la venta (`saleDate`), no la de ahora;
 *  - `reprint: true` agrega la leyenda "REIMPRESIÓN";
 *  - descuento, recargo, total y pagos salen de lo PERSISTIDO (el servidor ya
 *    los materializó; los pagos de tarjeta ya incluyen el recargo).
 */
export function saleToTicket(sale: Sale, company: TicketCompany = {}): SaleTicket {
  const rows = sale.items ?? sale.products ?? [];
  const items = rows.map(toTicketItem);
  const base = buildSaleTicket({ ...company, issuedAt: sale.saleDate, items });

  const discountAmount = round2(sale.discount ?? 0);
  const surchargeAmount = round2(sale.surcharge ?? 0);
  const payments = sale.payments ?? [];

  // % derivados de los montos guardados (el ticket muestra "Descuento 10%").
  const discountPct =
    discountAmount > 0 && base.subtotal > 0 ? round2((discountAmount / base.subtotal) * 100) : 0;
  const cardPaid = payments
    .filter((p) => p.method === "TARJETA_CREDITO")
    .reduce((s, p) => s + p.amount, 0);
  const cardBase = cardPaid - surchargeAmount;
  const surchargePct =
    surchargeAmount > 0 && cardBase > 0 ? round2((surchargeAmount / cardBase) * 100) : 0;

  return {
    ...base,
    discountPct,
    discountAmount,
    surchargePct,
    surchargeAmount,
    total: round2(sale.totalAmount),
    payments: payments.map((p) => ({
      methodLabel: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
      amount: p.amount,
    })),
    reprint: true,
  };
}

type SavedRow = NonNullable<Sale["items"]>[number] | NonNullable<Sale["products"]>[number];

/** Renglón guardado → renglón del carrito que entiende buildSaleTicket. */
function toTicketItem(row: SavedRow): SaleTicketItem {
  const saleMode = "saleMode" in row ? row.saleMode : undefined;
  const meta = { saleMode, productId: "productId" in row ? row.productId : undefined, loosePriceId: "loosePriceId" in row ? row.loosePriceId : undefined };

  // Venta libre: el total es el guardado (kg × precio/kg).
  if (isFreeLineSaleItem({ ...meta, quantity: row.quantity })) {
    return {
      name: row.name,
      price: row.price,
      quantity: row.quantity,
      saleMode: "POR_PESO",
      isFreeLine: true,
      lineTotal: round2(row.price * row.quantity),
    };
  }
  // POR_MONTO se guarda como kg × precio/kg; el ticket original muestra el monto
  // y entre paréntesis los kg: se reconstruye con quantity = monto, price = 1.
  if (saleMode === "POR_MONTO") {
    return {
      name: row.name,
      looseName: row.name,
      price: 1,
      quantity: round2(row.price * row.quantity),
      saleMode,
      priceKgSuelto: row.price,
    };
  }
  return {
    name: row.name,
    looseName: row.name,
    price: row.price,
    quantity: row.quantity,
    saleMode,
  };
}

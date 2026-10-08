import type { Sale } from "../models/salesModel";
import { round2 } from "../lib/money";

/** Fila de un ranking: etiqueta, monto en $ (criterio de orden) y cantidad. */
export interface RankedRow {
  label: string;
  amount: number;
  quantity: number;
  /** "kg" cuando todos los renglones del grupo son venta suelta (cantidad en kg). */
  unit?: "kg";
}

export const SIN_CATEGORIA = "Sin categoría";
export const OTRAS_CATEGORIAS = "Otras";
export const LOOSE_CATEGORY = "Alimento suelto (por peso)";

const MAX_CATEGORIES = 8;
const MAX_PRODUCTS = 10;

interface Line {
  name: string;
  category: string;
  key: string;
  amount: number;
  quantity: number;
  loose: boolean;
}

/** Renglón suelto: la cantidad está en kg (celda suelta o venta por peso/monto). */
const isLooseItem = (it: { loosePriceId?: string | null; saleMode?: string }): boolean =>
  !!it.loosePriceId || it.saleMode === "POR_PESO" || it.saleMode === "POR_MONTO";

/**
 * Aplana los renglones de las ventas. El monto de cada renglón es
 * round2(cantidad × precio), la misma fórmula que usa el server para el
 * total de la línea (salesService: BOLSA/POR_PESO = kg × precio; POR_MONTO
 * guarda kg = monto ÷ precio, así que cantidad × precio reproduce el monto).
 * NO resta descuento ni recargo a nivel venta (son a nivel venta, no de
 * renglón): la suma de rankings queda "antes de descuentos". Las ventas
 * legacy sin `items` caen al campo `products` (sin categoría).
 */
const flattenLines = (sales: Sale[]): Line[] => {
  const lines: Line[] = [];
  for (const sale of sales) {
    if (sale.items?.length) {
      for (const it of sale.items) {
        const quantity = Number(it.quantity) || 0;
        const loose = isLooseItem(it);
        const key = it.productId || it.loosePriceId || it.name;
        lines.push({
          name: it.name,
          category: (it.category ?? "").trim() || (loose ? LOOSE_CATEGORY : SIN_CATEGORIA),
          key: it.productId
            ? `p:${it.productId}`
            : it.loosePriceId
              ? `l:${it.loosePriceId}`
              : `n:${key}`,
          amount: round2(quantity * (Number(it.price) || 0)),
          quantity,
          loose,
        });
      }
    } else if (sale.products?.length) {
      for (const p of sale.products) {
        const quantity = Number(p.quantity) || 0;
        lines.push({
          name: p.name,
          category: SIN_CATEGORIA,
          key: `n:${p.name}`,
          amount: round2(quantity * (Number(p.price) || 0)),
          quantity,
          loose: false,
        });
      }
    }
  }
  return lines;
};

const byAmountThenLabel = (a: RankedRow, b: RankedRow): number =>
  b.amount - a.amount || a.label.localeCompare(b.label, "es");

const accumulate = (
  groups: Map<string, RankedRow>,
  key: string,
  label: string,
  amount: number,
  quantity: number,
  loose: boolean,
) => {
  const cur = groups.get(key) ?? { label, amount: 0, quantity: 0, unit: loose ? ("kg" as const) : undefined };
  cur.amount += amount;
  cur.quantity += quantity;
  if (!loose) cur.unit = undefined;
  groups.set(key, cur);
};

const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;

const finalize = (groups: Map<string, RankedRow>): RankedRow[] =>
  [...groups.values()]
    .map((r) => ({
      label: r.label,
      amount: round2(r.amount),
      quantity: round3(r.quantity),
      ...(r.unit ? { unit: r.unit } : {}),
    }))
    .filter((r) => r.amount > 0)
    .sort(byAmountThenLabel);

/** Ventas por categoría: top 8 por monto + "Otras" (el resto agrupado). */
export const aggregateSalesByCategory = (sales: Sale[]): RankedRow[] => {
  const groups = new Map<string, RankedRow>();
  for (const l of flattenLines(sales)) {
    accumulate(groups, l.category, l.category, l.amount, l.quantity, l.loose);
  }
  const rows = finalize(groups);
  if (rows.length <= MAX_CATEGORIES) return rows;
  const top = rows.slice(0, MAX_CATEGORIES);
  const rest = rows.slice(MAX_CATEGORIES);
  return [
    ...top,
    {
      label: OTRAS_CATEGORIAS,
      amount: round2(rest.reduce((s, r) => s + r.amount, 0)),
      quantity: round3(rest.reduce((s, r) => s + r.quantity, 0)),
    },
  ];
};

/** Productos más vendidos por MONTO (no por cantidad). */
export const aggregateTopProducts = (
  sales: Sale[],
  limit: number = MAX_PRODUCTS,
): RankedRow[] => {
  const groups = new Map<string, RankedRow>();
  for (const l of flattenLines(sales)) {
    accumulate(groups, l.key, l.name, l.amount, l.quantity, l.loose);
  }
  return finalize(groups).slice(0, limit);
};

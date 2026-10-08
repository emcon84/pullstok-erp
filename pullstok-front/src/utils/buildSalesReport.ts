/**
 * Pure builder for the sales report (PDF/Excel). It turns the data already
 * computed by the Statistics dashboard into a render-ready structure with
 * labels, percentages and KPIs. No jsPDF / xlsx / DOM here: the renderers
 * only draw what this returns.
 */
import type { AccountCollections } from "../models/customerAccountModel";
import { customerDisplayName } from "./customerName";
import type { RankedRow } from "./salesAggregations";
import type { PaymentBreakdownRow, PeriodFilter } from "./statsHelpers";

export interface SalesReportInput {
  periodLabel: string;
  generatedAt: Date;
  chartData: { name: string; value: number; cantidad: number }[];
  total: number;
  count: number;
  payments: PaymentBreakdownRow[];
  paymentLabel: (method: string) => string;
  collections: AccountCollections | null;
  categories: RankedRow[];
  products: RankedRow[];
  /** Optional organization name shown in the header. */
  orgName?: string;
}

export interface ShareRow {
  label: string;
  amount: number;
  percent: number;
}

export interface SalesReport {
  title: string;
  orgName?: string;
  periodLabel: string;
  generatedLabel: string;
  fileName: string;
  kpis: {
    count: number;
    total: number;
    average: number;
    bestPeriod: { name: string; value: number } | null;
  };
  evolution: { name: string; value: number }[];
  payments: { rows: (ShareRow & { count: number })[]; total: number };
  collections: {
    total: number;
    count: number;
    truncated: boolean;
    rows: (ShareRow & { count: number })[];
    items: { date: string; customer: string; method: string; amount: number }[];
  } | null;
  categories: (ShareRow & { quantity: number; unit?: "kg" })[];
  products: (ShareRow & { quantity: number; unit?: "kg" })[];
  detail: { name: string; count: number; total: number; average: number }[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

const dateLabel = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Percentage with one decimal; 0 when the base is not positive. */
const percentOf = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

const withShare = <T extends { amount: number }>(rows: T[]) => {
  const whole = rows.reduce((s, r) => s + r.amount, 0);
  return rows.map((r) => ({ ...r, percent: percentOf(r.amount, whole) }));
};

/** Human label for the period the dashboard is filtering on. */
export const buildPeriodLabel = (period: PeriodFilter, selectedDay: Date, now: Date = new Date()): string => {
  switch (period) {
    case "daily":
      return `Día ${dateLabel(selectedDay)}`;
    case "weekly":
      return `Últimos 7 días (hasta ${dateLabel(now)})`;
    case "monthly":
      return `Último mes (hasta ${dateLabel(now)})`;
    case "yearly":
      return `Último año (hasta ${dateLabel(now)})`;
  }
};

export const buildSalesReport = (input: SalesReportInput): SalesReport => {
  const { chartData, total, count } = input;

  const best = chartData.reduce<{ name: string; value: number } | null>(
    (acc, p) => (p.value > (acc?.value ?? -Infinity) ? { name: p.name, value: p.value } : acc),
    null,
  );

  const payments = withShare(
    input.payments.map((p) => ({ label: input.paymentLabel(p.method), amount: p.amount, count: p.count })),
  );

  const col = input.collections;
  const collections =
    col && col.byMethod.length > 0
      ? {
          total: col.total,
          count: col.count,
          truncated: col.truncated,
          rows: withShare(
            col.byMethod.map((r) => ({ label: input.paymentLabel(r.method), amount: r.amount, count: r.count })),
          ),
          items: col.items.map((it) => {
            const d = new Date(it.createdAt);
            return {
              date: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
              customer: customerDisplayName({ name: it.customerName }),
              method: input.paymentLabel(it.method),
              amount: it.amount,
            };
          }),
        }
      : null;

  const g = input.generatedAt;
  return {
    title: "Informe de ventas",
    orgName: input.orgName,
    periodLabel: input.periodLabel,
    generatedLabel: `${dateLabel(g)} ${pad2(g.getHours())}:${pad2(g.getMinutes())}`,
    fileName: `Informe_de_ventas_${g.getFullYear()}-${pad2(g.getMonth() + 1)}-${pad2(g.getDate())}`,
    kpis: { count, total, average: count > 0 ? total / count : 0, bestPeriod: best },
    evolution: chartData.map((p) => ({ name: p.name, value: p.value })),
    payments: { rows: payments, total: payments.reduce((s, r) => s + r.amount, 0) },
    collections,
    categories: withShare(input.categories.map((c) => ({ label: c.label, amount: c.amount, quantity: c.quantity, ...(c.unit ? { unit: c.unit } : {}) }))),
    products: withShare(input.products.map((c) => ({ label: c.label, amount: c.amount, quantity: c.quantity, ...(c.unit ? { unit: c.unit } : {}) }))),
    detail: chartData.map((p) => ({
      name: p.name,
      count: p.cantidad,
      total: p.value,
      average: p.cantidad > 0 ? p.value / p.cantidad : 0,
    })),
  };
};

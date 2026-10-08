import { describe, it, expect } from "vitest";
import { buildSalesReport, buildPeriodLabel } from "../utils/buildSalesReport";

const labels: Record<string, string> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia" };
const paymentLabel = (m: string) => labels[m] ?? m;

const base = {
  periodLabel: "Octubre 2026",
  generatedAt: new Date(2026, 9, 8, 14, 5),
  chartData: [
    { name: "01/10", value: 1000, cantidad: 2 },
    { name: "02/10", value: 3000, cantidad: 3 },
    { name: "03/10", value: 2000, cantidad: 1 },
  ],
  total: 6000,
  count: 6,
  payments: [
    { method: "EFECTIVO", count: 4, amount: 4500 },
    { method: "TRANSFERENCIA", count: 2, amount: 1500 },
  ],
  paymentLabel,
  collections: {
    total: 800,
    count: 2,
    byMethod: [{ method: "EFECTIVO", count: 2, amount: 800 }],
    items: [
      { id: "1", createdAt: "2026-10-02T15:30:00.000Z", customerId: "c1", customerName: "Ana", method: "EFECTIVO", amount: 500 },
      { id: "2", createdAt: "2026-10-03T15:30:00.000Z", customerId: "c2", customerName: null, method: "EFECTIVO", amount: 300 },
    ],
    truncated: false,
  },
  categories: [
    { label: "Alimento", amount: 4000, quantity: 10 },
    { label: "Accesorios", amount: 1000, quantity: 5 },
  ],
  products: [{ label: "Prod A", amount: 2500, quantity: 3 }],
};

describe("buildSalesReport", () => {
  it("computes KPIs: count, total, average and best period", () => {
    const r = buildSalesReport(base);
    expect(r.kpis.count).toBe(6);
    expect(r.kpis.total).toBe(6000);
    expect(r.kpis.average).toBe(1000);
    expect(r.kpis.bestPeriod).toEqual({ name: "02/10", value: 3000 });
  });

  it("computes payment percentages and totals", () => {
    const r = buildSalesReport(base);
    expect(r.payments.rows.map((p) => [p.label, p.percent])).toEqual([
      ["Efectivo", 75],
      ["Transferencia", 25],
    ]);
    expect(r.payments.total).toBe(6000);
  });

  it("computes category and product shares over their own totals", () => {
    const r = buildSalesReport(base);
    expect(r.categories.map((c) => c.percent)).toEqual([80, 20]);
    expect(r.products[0]).toMatchObject({ label: "Prod A", percent: 100 });
  });

  it("builds the detail rows with per-period average", () => {
    const r = buildSalesReport(base);
    expect(r.detail[1]).toEqual({ name: "02/10", count: 3, total: 3000, average: 1000 });
  });

  it("keeps collections summary and detail with resolved labels", () => {
    const r = buildSalesReport(base);
    expect(r.collections?.rows[0]).toMatchObject({ label: "Efectivo", percent: 100 });
    expect(r.collections?.items).toHaveLength(2);
    expect(r.collections?.items[1].customer).toBe("Sin nombre");
    expect(r.collections?.items[0].method).toBe("Efectivo");
  });

  it("returns an empty period safely (no NaN, null sections)", () => {
    const r = buildSalesReport({
      ...base,
      chartData: [],
      total: 0,
      count: 0,
      payments: [],
      collections: null,
      categories: [],
      products: [],
    });
    expect(r.kpis).toEqual({ count: 0, total: 0, average: 0, bestPeriod: null });
    expect(r.payments.rows).toEqual([]);
    expect(r.collections).toBeNull();
    expect(r.detail).toEqual([]);
  });

  it("treats collections with no rows as absent", () => {
    const r = buildSalesReport({ ...base, collections: { total: 0, count: 0, byMethod: [], items: [], truncated: false } });
    expect(r.collections).toBeNull();
  });

  it("builds a header with period label, generated date and file name", () => {
    const r = buildSalesReport(base);
    expect(r.title).toBe("Informe de ventas");
    expect(r.periodLabel).toBe("Octubre 2026");
    expect(r.generatedLabel).toBe("08/10/2026 14:05");
    expect(r.fileName).toBe("Informe_de_ventas_2026-10-08");
  });
});

describe("buildPeriodLabel", () => {
  const now = new Date(2026, 9, 8);
  it("uses the selected day for daily", () => {
    expect(buildPeriodLabel("daily", new Date(2026, 9, 5), now)).toBe("Día 05/10/2026");
  });
  it("describes the rolling windows", () => {
    expect(buildPeriodLabel("weekly", now, now)).toBe("Últimos 7 días (hasta 08/10/2026)");
    expect(buildPeriodLabel("monthly", now, now)).toBe("Último mes (hasta 08/10/2026)");
    expect(buildPeriodLabel("yearly", now, now)).toBe("Último año (hasta 08/10/2026)");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type jsPDF from "jspdf";

// jsPDF v4 attaches API methods per instance, so a prototype spy would not
// work: mock the module with a subclass that re-exposes the primitives as
// spies (same approach as exportToPDF.test.ts) while keeping real behavior.
const { saveMock, textSpy, rectSpy, lineSpy, addImageSpy } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  textSpy: vi.fn(),
  rectSpy: vi.fn(),
  lineSpy: vi.fn(),
  addImageSpy: vi.fn(),
}));

vi.mock("jspdf", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof jsPDF }>();
  const Base = actual.default;
  class MockJsPDF extends Base {
    save = saveMock;
    text = (...args: unknown[]) => {
      textSpy(...args);
      return this;
    };
    rect = (...args: unknown[]) => {
      rectSpy(...args);
      return this;
    };
    line = (...args: unknown[]) => {
      lineSpy(...args);
      return this;
    };
    addImage = (...args: unknown[]) => {
      addImageSpy(...args);
      return this;
    };
  }
  return { default: MockJsPDF };
});

import { buildSalesReport } from "../utils/buildSalesReport";
import { renderSalesReportPdf, exportSalesReportPdf } from "../utils/exportSalesReport";

const labels: Record<string, string> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia" };

const makeInput = (over: Record<string, unknown> = {}) => ({
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
  paymentLabel: (m: string) => labels[m] ?? m,
  collections: {
    total: 500,
    count: 1,
    byMethod: [{ method: "EFECTIVO", count: 1, amount: 500 }],
    items: [{ id: "1", createdAt: "2026-10-02T15:30:00.000Z", customerId: "c1", customerName: "Ana Pérez", method: "EFECTIVO", amount: 500 }],
    truncated: false,
  },
  categories: [{ label: "Alimento", amount: 4000, quantity: 10 }],
  products: [{ label: "Producto Estrella", amount: 2500, quantity: 3 }],
  ...over,
});

const texts = () => textSpy.mock.calls.map((c) => String(c[0]));
const hasText = (needle: string) => texts().some((t) => t.includes(needle));

describe("renderSalesReportPdf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders an A4 document with header, KPIs and every section", () => {
    const doc = renderSalesReportPdf(buildSalesReport(makeInput()));
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(595.28, 0);
    expect(hasText("Informe de ventas")).toBe(true);
    expect(hasText("Octubre 2026")).toBe(true);
    expect(hasText("08/10/2026 14:05")).toBe(true);
    for (const kpi of ["Ventas", "Total vendido", "Ticket promedio", "Mejor período"]) {
      expect(hasText(kpi)).toBe(true);
    }
    for (const section of [
      "Evolución de ventas",
      "Medios de pago",
      "Cobros de cuenta corriente",
      "Ventas por categoría",
      "Top 10 productos",
      "Detalle por período",
    ]) {
      expect(hasText(section)).toBe(true);
    }
    expect(hasText("Ana Pérez")).toBe(true);
    expect(hasText("Producto Estrella")).toBe(true);
  });

  it("formats quantities es-AR rounded to 3 decimals, with kg for loose rows", () => {
    renderSalesReportPdf(
      buildSalesReport(
        makeInput({
          categories: [
            { label: "Alimento suelto (por peso)", amount: 5000, quantity: 1134.6451000000002, unit: "kg" },
            { label: "Accesorios", amount: 1000, quantity: 194.01 },
          ],
          products: [{ label: "Granel", amount: 500, quantity: 2.5, unit: "kg" }],
        }),
      ),
    );
    expect(texts()).toContain("1.134,645 kg");
    expect(texts()).toContain("194,01");
    expect(texts()).toContain("2,5 kg");
    expect(hasText("1134.6451")).toBe(false);
  });

  it("draws the evolution chart natively: one bar rect per period", () => {
    renderSalesReportPdf(buildSalesReport(makeInput()));
    // 3 bars + KPI boxes + payment segments etc. => at least the 3 bars exist
    expect(rectSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(addImageSpy).not.toHaveBeenCalled();
  });

  it("draws the logo when provided", () => {
    renderSalesReportPdf(buildSalesReport(makeInput()), { dataUrl: "data:image/png;base64,AAA", width: 200, height: 50 });
    expect(addImageSpy).toHaveBeenCalledTimes(1);
  });

  it("skips empty sections instead of rendering empty headings", () => {
    renderSalesReportPdf(
      buildSalesReport(
        makeInput({ chartData: [], total: 0, count: 0, payments: [], collections: null, categories: [], products: [] }),
      ),
    );
    expect(hasText("Informe de ventas")).toBe(true);
    for (const section of [
      "Evolución de ventas",
      "Medios de pago",
      "Cobros de cuenta corriente",
      "Ventas por categoría",
      "Top 10 productos",
      "Detalle por período",
    ]) {
      expect(hasText(section)).toBe(false);
    }
    expect(hasText("Sin ventas en el período")).toBe(true);
  });

  it("paginates long detail tables and numbers every page", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ name: `Día ${i + 1}`, value: 100 + i, cantidad: 1 }));
    const doc = renderSalesReportPdf(buildSalesReport(makeInput({ chartData: many, count: 150, total: 20000 })));
    const pages = doc.internal.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    expect(hasText(`Página 1 de ${pages}`)).toBe(true);
    expect(hasText(`Página ${pages} de ${pages}`)).toBe(true);
  });

  it("falls back to a line chart for dense series (no bar per point)", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ name: `d${i}`, value: 100 + (i % 7), cantidad: 1 }));
    renderSalesReportPdf(buildSalesReport(makeInput({ chartData: many, count: 120, total: 12000, payments: [], collections: null, categories: [], products: [] })));
    expect(lineSpy.mock.calls.length).toBeGreaterThanOrEqual(119);
  });
});

describe("exportSalesReportPdf", () => {
  it("saves the file with the report file name, even without a logo", async () => {
    vi.clearAllMocks();
    await exportSalesReportPdf(buildSalesReport(makeInput()), null);
    expect(saveMock).toHaveBeenCalledWith("Informe_de_ventas_2026-10-08.pdf");
  });
});

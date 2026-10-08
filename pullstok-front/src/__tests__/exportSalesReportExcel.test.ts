import { describe, it, expect, vi, beforeEach } from "vitest";

const { writeFileMock } = vi.hoisted(() => ({ writeFileMock: vi.fn() }));
vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return { ...actual, writeFile: writeFileMock };
});

import * as XLSX from "xlsx";
import { buildSalesReport } from "../utils/buildSalesReport";
import { buildSalesReportSheets, exportSalesReportExcel } from "../utils/exportSalesReport";

const labels: Record<string, string> = { EFECTIVO: "Efectivo" };
const makeReport = (over: Record<string, unknown> = {}) =>
  buildSalesReport({
    periodLabel: "Octubre 2026",
    generatedAt: new Date(2026, 9, 8, 14, 5),
    chartData: [
      { name: "01/10", value: 1000, cantidad: 2 },
      { name: "02/10", value: 3000, cantidad: 3 },
    ],
    total: 4000,
    count: 5,
    payments: [{ method: "EFECTIVO", count: 5, amount: 4000 }],
    paymentLabel: (m: string) => labels[m] ?? m,
    collections: {
      total: 500,
      count: 1,
      byMethod: [{ method: "EFECTIVO", count: 1, amount: 500 }],
      items: [{ id: "1", createdAt: "2026-10-02T15:30:00.000Z", customerId: "c1", customerName: "Ana", method: "EFECTIVO", amount: 500 }],
      truncated: false,
    },
    categories: [{ label: "Alimento", amount: 4000, quantity: 10 }],
    products: [{ label: "Prod A", amount: 2500, quantity: 3 }],
    ...over,
  });

describe("buildSalesReportSheets", () => {
  it("creates one sheet per section", () => {
    const names = buildSalesReportSheets(makeReport()).map((s) => s.name);
    expect(names).toEqual([
      "Resumen",
      "Evolución",
      "Medios de pago",
      "Cobros cta cte",
      "Categorías",
      "Top productos",
      "Detalle",
    ]);
  });

  it("keeps amounts numeric so Excel can sum them", () => {
    const sheets = buildSalesReportSheets(makeReport());
    const pay = sheets.find((s) => s.name === "Medios de pago")!;
    expect(pay.rows[0]).toEqual(["Medio de pago", "Cant.", "Monto", "%"]);
    expect(pay.rows[1]).toEqual(["Efectivo", 5, 4000, 100]);
    const summary = sheets.find((s) => s.name === "Resumen")!;
    expect(summary.rows).toContainEqual(["Total vendido", 4000]);
    expect(summary.rows).toContainEqual(["Período", "Octubre 2026"]);
  });

  it("puts collection summary and detail on the same sheet", () => {
    const col = buildSalesReportSheets(makeReport()).find((s) => s.name === "Cobros cta cte")!;
    expect(col.rows).toContainEqual(["Efectivo", 1, 500, 100]);
    expect(col.rows.some((r) => r[1] === "Ana" && r[2] === "Efectivo" && r[3] === 500)).toBe(true);
  });

  it("omits sheets for empty sections", () => {
    const names = buildSalesReportSheets(
      makeReport({ chartData: [], total: 0, count: 0, payments: [], collections: null, categories: [], products: [] }),
    ).map((s) => s.name);
    expect(names).toEqual(["Resumen"]);
  });
});

describe("exportSalesReportExcel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes a workbook with the report file name", () => {
    exportSalesReportExcel(makeReport());
    const [wb, file] = writeFileMock.mock.calls[0] as [XLSX.WorkBook, string];
    expect(file).toBe("Informe_de_ventas_2026-10-08.xlsx");
    expect(wb.SheetNames).toHaveLength(7);
  });
});

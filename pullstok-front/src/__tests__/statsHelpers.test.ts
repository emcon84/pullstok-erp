import { describe, it, expect } from "vitest";
import {
  filterByDateRange,
  groupByPeriod,
  getDateRange,
  sumByPaymentMethod,
} from "../utils/statsHelpers";

// Una "venta" del backend: trae saleDate y NO createdAt (el modelo Sale no lo expone).
const saleIn = (iso: string) => ({ saleDate: iso, totalAmount: 100 });
// Un "presupuesto/pedido": trae createdAt.
const budgetIn = (iso: string) => ({ createdAt: iso, totalAmount: 50 });

describe("filterByDateRange", () => {
  it("incluye ventas por saleDate (sin createdAt)", () => {
    const range = getDateRange("monthly");
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(filterByDateRange([saleIn(haceUnaHora)], range)).toHaveLength(1);
  });

  it("sigue incluyendo presupuestos por createdAt", () => {
    const range = getDateRange("monthly");
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(filterByDateRange([budgetIn(haceUnaHora)], range)).toHaveLength(1);
  });

  it("excluye lo que no tiene ni createdAt ni saleDate", () => {
    const range = getDateRange("monthly");
    expect(filterByDateRange([{ totalAmount: 10 }], range)).toHaveLength(0);
  });
});

describe("groupByPeriod (monthly)", () => {
  it("agrupa ventas por saleDate con el mes correcto", () => {
    const grouped = groupByPeriod(
      [saleIn("2026-08-05T12:00:00.000Z"), saleIn("2026-08-20T12:00:00.000Z")],
      "monthly",
    );
    expect(Object.keys(grouped)).toEqual(["2026-08"]);
    expect(grouped["2026-08"]).toHaveLength(2);
  });
});

describe("sumByPaymentMethod", () => {
  it("agrega por método y ordena por monto descendente", () => {
    const res = sumByPaymentMethod([
      { payments: [{ method: "EFECTIVO", amount: 100 }, { method: "TARJETA_CREDITO", amount: 50 }] },
      { payments: [{ method: "EFECTIVO", amount: 60 }] },
    ]);
    expect(res).toEqual([
      { method: "EFECTIVO", count: 2, amount: 160 },
      { method: "TARJETA_CREDITO", count: 1, amount: 50 },
    ]);
  });

  it("ignora ventas sin payments y montos no numéricos", () => {
    const res = sumByPaymentMethod([
      { payments: [{ method: "QR", amount: "no-numero" as unknown as number }] },
      {},
    ]);
    expect(res).toEqual([{ method: "QR", count: 1, amount: 0 }]);
  });
});

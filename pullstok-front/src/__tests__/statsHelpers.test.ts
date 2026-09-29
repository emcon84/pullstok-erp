import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  filterByDateRange,
  groupByPeriod,
  getDateRange,
  sumByPaymentMethod,
  formatPeriodLabel,
} from "../utils/statsHelpers";

const pad = (n: number) => String(n).padStart(2, "0");
const localKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

describe("getDateRange (daily, con referenceDate)", () => {
  it("devuelve el día completo LOCAL de referenceDate, sin importar la hora actual", () => {
    const ref = new Date(2026, 2, 15, 9, 0, 0); // 15/mar/2026 09:00 local
    const range = getDateRange("daily", ref);

    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getMonth()).toBe(2);
    expect(range.start.getDate()).toBe(15);
    expect([range.start.getHours(), range.start.getMinutes(), range.start.getSeconds(), range.start.getMilliseconds()]).toEqual([0, 0, 0, 0]);

    expect(range.end.getFullYear()).toBe(2026);
    expect(range.end.getMonth()).toBe(2);
    expect(range.end.getDate()).toBe(15);
    expect([range.end.getHours(), range.end.getMinutes(), range.end.getSeconds(), range.end.getMilliseconds()]).toEqual([23, 59, 59, 999]);
  });

  it("sin referenceDate se comporta como hoy, día completo", () => {
    const today = new Date();
    const range = getDateRange("daily");

    expect(localKey(range.start)).toBe(localKey(today));
    expect([range.start.getHours(), range.start.getMinutes(), range.start.getSeconds(), range.start.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    expect(localKey(range.end)).toBe(localKey(today));
    expect([range.end.getHours(), range.end.getMinutes(), range.end.getSeconds(), range.end.getMilliseconds()]).toEqual([23, 59, 59, 999]);
  });

  it("weekly/monthly/yearly no cambian: siguen terminando en 'ahora' (comportamiento previo intacto)", () => {
    const before = new Date();
    const weekly = getDateRange("weekly");
    const monthly = getDateRange("monthly");
    const yearly = getDateRange("yearly");
    const after = new Date();

    for (const range of [weekly, monthly, yearly]) {
      expect(range.end.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(range.end.getTime()).toBeLessThanOrEqual(after.getTime());
    }
  });
});

// Los bugs de zona horaria (agrupar por día UTC en vez de local, y parsear
// "YYYY-MM-DD" como medianoche UTC) solo se manifiestan en husos negativos
// cerca de la medianoche local (ej. Argentina UTC-3, 21:00-23:59 local cae en
// el día UTC siguiente). Para que el test no sea flaky según el TZ de la CI,
// forzamos process.env.TZ a Argentina para este bloque (Node relee TZ en
// cada cálculo de Date local, no lo cachea al arrancar el proceso).
describe("groupByPeriod / formatPeriodLabel — huso horario negativo (Argentina, UTC-3)", () => {
  const originalTZ = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/Argentina/Buenos_Aires";
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it("una venta a las 23:30 ART cae en SU día local para 'daily' (no en el día siguiente)", () => {
    const saleAt2330 = new Date(2026, 8, 28, 23, 30, 0); // 28/sep/2026 23:30 local (ART)
    const grouped = groupByPeriod([{ saleDate: saleAt2330, totalAmount: 100 }], "daily");

    expect(Object.keys(grouped)).toEqual(["2026-09-28"]);
  });

  it("una venta a las 23:30 ART cae en el inicio de SU semana local para 'weekly'", () => {
    const saleAt2330 = new Date(2026, 8, 28, 23, 30, 0); // 28/sep/2026 23:30 local (ART)
    const dow = saleAt2330.getDay();
    const expectedWeekStart = new Date(2026, 8, 28 - dow);
    const expectedKey = localKey(expectedWeekStart);

    const grouped = groupByPeriod([{ saleDate: saleAt2330, totalAmount: 100 }], "weekly");

    expect(Object.keys(grouped)).toEqual([expectedKey]);
  });

  // El mes sin cero a la izquierda ("9" en vez de "09") es un detalle del
  // formateo ICU de este entorno para `es-ES` + `month: "2-digit"`, no algo
  // que este fix toque: por eso el assert usa el propio `toLocaleDateString`
  // (misma llamada que hace `formatPeriodLabel`) para construir el sufijo
  // esperado en vez de hardcodear "09".
  const expectedDayMonth = (d: Date) =>
    d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });

  it("formatPeriodLabel('daily') muestra el día 28 (no 27) para la clave '2026-09-28'", () => {
    expect(formatPeriodLabel("2026-09-28", "daily")).toBe(
      expectedDayMonth(new Date(2026, 8, 28)),
    );
  });

  it("formatPeriodLabel('weekly') muestra el día 28 (no 27) para la clave '2026-09-28'", () => {
    expect(formatPeriodLabel("2026-09-28", "weekly")).toBe(
      `Semana ${expectedDayMonth(new Date(2026, 8, 28))}`,
    );
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

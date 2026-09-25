// Dataset: "Lista de precios de huesos a granel" (planilla lista sep 2026.xlsx,
// hoja "Hoja1"). Extraído por script de la planilla (no transcripto a mano);
// una fila = una fila de datos de Excel (4-62) que tenga nombre, cantidad por
// bolsa o precio. Se excluyen las filas totalmente vacías y las notas del pie
// (envío/pago). Datos puros + planLoad, sin acceso a DB, para poder testearlos
// y revisarlos antes de escribir nada en prod.
//
// - name: texto de la columna "Descripcion" con trim (crudo, sin normalizar).
// - bagQty: columna "Bolsa x uni" (no se guarda: el precio ya es por unidad).
// - price: columna "precioxunidad"; null cuando estaba vacía o en 0.
import { normalizeProductName } from "../../src/utils/productName";

export const DEFAULT_ORG = "1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b";

// Categoría destino, se resuelve en runtime por nombre (padre + hoja), no por id.
export const TARGET_CATEGORY = {
  parent: "PERROS",
  leaf: "SNACKS, PREMIOS Y GOLOSINAS",
} as const;

export interface HuesosRow {
  /** Número de fila en el Excel, para trazabilidad. */
  row: number;
  name: string;
  bagQty: number | null;
  price: number | null;
}

export const HUESOS_ROWS: readonly HuesosRow[] = [
  { row: 4, name: "Hueso corbata 3/4", bagQty: 500, price: 734 },
  { row: 5, name: "Hueso corbata 4/5", bagQty: 250, price: 945 },
  { row: 6, name: "Hueso corbata 5/6", bagQty: 150, price: 1230 },
  { row: 7, name: "Hueso corbata 6/7", bagQty: 110, price: 1730 },
  { row: 8, name: "Hueso corbata 7/8", bagQty: 80, price: 2320 },
  { row: 9, name: "Hueso corbata 8/9", bagQty: 70, price: 2923 },
  { row: 10, name: "Hueso corbata 9/10", bagQty: 50, price: 3420 },
  { row: 11, name: "Hueso corbata 10/11", bagQty: 40, price: 4344 },
  { row: 12, name: "Hueso corbata 11/12", bagQty: 35, price: 5499 },
  { row: 13, name: "Hueso corbata 12/13", bagQty: 20, price: 6495 },
  { row: 14, name: "Hueso corbata 13/14", bagQty: 10, price: 7990 },
  { row: 15, name: "Hueso corbata 14/15", bagQty: 5, price: 8550 },
  { row: 16, name: "Hueso corbata 15/16", bagQty: 5, price: 9890 },
  { row: 17, name: "Hueso corbata 16/17", bagQty: 5, price: null },
  { row: 18, name: "Hueso corbata 17/18", bagQty: 5, price: null },
  { row: 19, name: "hueso corbata 18/19", bagQty: 5, price: null },
  { row: 20, name: "hueso corbata 19/20", bagQty: 5, price: 18250 },
  { row: 21, name: "hueso corbata 20/21", bagQty: 5, price: null },
  { row: 22, name: "Hueso corbata 21/22", bagQty: 5, price: null },
  { row: 23, name: "Hueso corbata 22/23", bagQty: 5, price: null },
  { row: 24, name: "Hueso corbata 23/24", bagQty: 5, price: null },
  { row: 25, name: "hueso corbata 24/25", bagQty: 5, price: 27900 },
  { row: 26, name: "", bagQty: null, price: 62 },
  { row: 27, name: "Mini hueso redondo", bagQty: 100, price: 650 },
  { row: 28, name: "Mini hueso corbata", bagQty: 100, price: 650 },
  { row: 29, name: "", bagQty: null, price: 118 },
  { row: 30, name: "Roll 4/5", bagQty: 50, price: 750 },
  { row: 31, name: "", bagQty: null, price: 1170 },
  { row: 32, name: "Roll 6/7", bagQty: 50, price: 1160 },
  { row: 33, name: "Roll 8/9", bagQty: 50, price: 1555 },
  { row: 34, name: "Roll 9/10", bagQty: 50, price: null },
  { row: 36, name: "Mini trenzas x unidad", bagQty: 1, price: 1350 },
  { row: 37, name: "Trenzas 9/10", bagQty: 1, price: 2600 },
  { row: 40, name: "Grisines 7/8\" unidad", bagQty: 350, price: 495 },
  { row: 42, name: "Mini Donuts 2,5", bagQty: 50, price: 795 },
  { row: 43, name: "Donuts 3,5", bagQty: 50, price: 1115 },
  { row: 44, name: "Donuts 5,5", bagQty: 10, price: 3450 },
  { row: 45, name: "Donuts 6,5", bagQty: 10, price: null },
  { row: 47, name: "", bagQty: 50, price: null },
  { row: 49, name: "Papa chips 1 kg", bagQty: 10, price: 9700 },
  { row: 50, name: "Mostacholes 1 Kg", bagQty: 5, price: 9700 },
  { row: 51, name: "Rolitos x Kg", bagQty: 5, price: 9700 },
  { row: 52, name: "Pizzetas x kg", bagQty: 5, price: 9700 },
  { row: 55, name: "orejas de cerdo x 200u", bagQty: 200, price: 725 },
  { row: 56, name: "palitos finos x 200u", bagQty: 130, price: 6490 },
  { row: 57, name: "Palitos colores x 200", bagQty: 10, price: 8890 },
  { row: 59, name: "Twist 5\" x 100 medianos", bagQty: 5, price: 15900 },
  { row: 61, name: "Orejas de vaca hasta 12cm", bagQty: 250, price: 699 },
  { row: 62, name: "orejas de vaca hasta 16 cm", bagQty: 130, price: 1450 },
];

export interface PlannedProduct {
  name: string;
  price: number;
}

export interface SkippedRow {
  row: number;
  text: string;
  reason: string;
}

export interface LoadPlan {
  toCreate: PlannedProduct[];
  existing: Array<{ row: number; name: string }>;
  skipped: SkippedRow[];
}

// Decide qué escribiría una corrida: filas con nombre y precio > 0 cuyo nombre
// normalizado no exista ya en la org (case-insensitive) ni se repita antes en
// la propia planilla (gana la primera). Nunca planea un update ni un delete.
export function planLoad(
  rows: readonly HuesosRow[],
  existingNames: ReadonlySet<string>,
): LoadPlan {
  const taken = new Set([...existingNames].map(normalizeProductName));
  const seen = new Set<string>();
  const plan: LoadPlan = { toCreate: [], existing: [], skipped: [] };
  for (const r of rows) {
    const name = normalizeProductName(r.name);
    if (!name) {
      plan.skipped.push({ row: r.row, text: r.name, reason: "sin nombre" });
      continue;
    }
    if (typeof r.price !== "number" || !Number.isFinite(r.price) || r.price <= 0) {
      plan.skipped.push({ row: r.row, text: r.name, reason: "sin precio" });
      continue;
    }
    if (seen.has(name)) {
      plan.skipped.push({ row: r.row, text: r.name, reason: "duplicado en la planilla" });
      continue;
    }
    seen.add(name);
    if (taken.has(name)) {
      plan.existing.push({ row: r.row, name });
      continue;
    }
    plan.toCreate.push({ name, price: r.price });
  }
  return plan;
}

// Nombres normalizados de los productos que esta carga crea (org vacía). Los
// scripts de stock inicial y de "carried" los usan para tocar SOLO estos.
export const HUESOS_NAMES: readonly string[] = planLoad(HUESOS_ROWS, new Set()).toCreate.map(
  (p) => p.name,
);

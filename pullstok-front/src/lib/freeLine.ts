// Venta libre: línea ad-hoc (nombre + gramos + total) sin Product.
//
// Contrato de unidades: en el carrito y en el servidor la cantidad se guarda en
// KG (3 decimales = resolución de gramo, igual que POR_PESO); la UI la muestra y
// la carga en gramos. El server la persiste como renglón POR_PESO con productId
// y loosePriceId null (ver salesService, freeLine).

const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Gramos tipeados → kg con resolución de gramo (350 → 0.35). */
export const gramsToKg = (grams: number): number => round3(grams / 1000);

/** "350 g" bajo 1 kg; desde 1000 g en kg es-AR ("1,25 kg"). Recibe kg. */
export const formatFreeLineWeight = (kg: number): string => {
  const grams = Math.round(kg * 1000);
  if (grams < 1000) return `${grams} g`;
  return `${(grams / 1000).toLocaleString("es-AR", { maximumFractionDigits: 3 })} kg`;
};

/** ¿El renglón guardado es una línea libre? POR_PESO sin producto ni celda. */
export const isFreeLineSaleItem = (item: {
  saleMode?: string;
  productId?: string | null;
  loosePriceId?: string | null;
}): boolean => item.saleMode === "POR_PESO" && !item.productId && !item.loosePriceId;

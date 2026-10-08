/** Redondea una cantidad a 3 decimales (resolución de gramo) como número. */
export const roundQuantity = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Cantidad es-AR, máx. 3 decimales; enteros sin decimales; sufijo " kg" si es suelto. */
export const formatQuantity = (n: number, unit?: "kg"): string => {
  const text = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(roundQuantity(n));
  return unit ? `${text} ${unit}` : text;
};

/**
 * Utilidades de CSV de códigos de balanza (formato de importación de Qendra /
 * balanza Systel Cuora). Fuente ÚNICA: la usan el CLI (export-scale-codes-csv)
 * y el endpoint GET /price-kg-plan/codes/csv, para que la descarga desde el
 * sistema sea byte-idéntica al archivo generado manualmente.
 *
 * Formato por fila (delimitado por ';', SIN encabezado):
 *   Sección;Código PLU;Descripción;Número de PLU;Precio lista 1;Precio lista 2;Tipo de venta;Vencimiento;Ingredientes
 *
 * Reglas (doc Systel "Metodología para interconectar datos... Qendra"):
 *   - Descripción: máx 18 caracteres (conjunto ASCII de la Cuora), en mayúsculas.
 *   - Precio: decimal con coma (config regional AR), sin símbolo de moneda.
 *   - Tipo de venta: "peso".
 *   - Código PLU y Número PLU: usar el mismo número (recomendación Systel).
 */

/** Conjunto de caracteres que soporta la Cuora (del doc Systel). */
const stripRestricted = (s: string): string =>
  s
    .replace(/[^!"#$%&'()*+,\-.\/0-9:;<=>?@A-Z\[\]^_`a-z{|}~ºñÑ ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Descripción de la celda: "MARCA TIPO ESPECIE" truncada a 18 y en zona ASCII. */
export const buildDescription = (brand: string, type: string, species: string): string => {
  const full = [brand, type, species].filter(Boolean).join(" ").toUpperCase();
  return stripRestricted(full).slice(0, 18);
};

/** Precio con coma decimal (config regional AR). */
export const formatPrice = (price: number): string =>
  price.toFixed(2).replace(".", ",");

export interface CsvRow {
  section: string;
  code: string;
  description: string;
  price: string;
}

/** Una fila del CSV Qendra (sección;PLU;desc;PLU;precio1;0,00;peso;0;). */
export const buildRow = (r: CsvRow): string => {
  const codeNum = r.code;
  return [
    r.section,
    codeNum, // Código PLU
    r.description, // Descripción
    codeNum, // Número PLU (mismo)
    r.price, // Precio lista 1
    "0,00", // Precio lista 2
    "peso", // Tipo de venta
    "0", // Vencimiento
    "", // Ingredientes
  ].join(";");
};

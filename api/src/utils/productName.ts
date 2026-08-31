/**
 * `normalizeProductName` — única fuenté de normalización del nombre de producto
 * al crearlo/actualizarlo desde una planilla de proveedor.
 *
 * Convención del negocio: el nombre de producto es SIEMPRE MAYÚSCULAS, con
 * espacios colapsados a uno y sin espacios al inicio/final. NO reescribe la
 * semántica (mantiene signos, guiones, "x", unidades, etc.): SOLO uppercase +
 * colapsar espacios + trim.
 *
 * Nota: no confundir con `normalizeName` (services/providerPriceListService),
 * que es un normalizador AGRESIVO para matching (quita acentos/unidades/palabras
 * de empaque). `normalizeProductName` es para el nombre PERSISTIDO.
 */
export function normalizeProductName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

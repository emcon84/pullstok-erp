/**
 * Mensajes en español para los códigos de error estables del server en ventas
 * (sdd/product-presentations). El server devuelve `{ message, code }`.
 */
const SALE_ERROR_MESSAGES: Record<string, string> = {
  PRESENTATION_REQUIRED: "Elegí una presentación para este producto",
  PRESENTATION_NOT_ALLOWED: "Este producto no maneja presentaciones",
  PRESENTATION_NOT_FOUND: "La presentación no pertenece al producto",
  PRESENTATION_INACTIVE: "La presentación está inactiva",
  PRESENTATION_NOT_SELLABLE: "La presentación está sin precio: cargá el precio antes de venderla",
  USE_PRESENTATION: "Este producto se vende por presentación: elegí una presentación",
};

export function saleErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string") return err || fallback;
  const e = err as { code?: string; message?: string } | null | undefined;
  if (e?.code && SALE_ERROR_MESSAGES[e.code]) return SALE_ERROR_MESSAGES[e.code];
  return e?.message || fallback;
}

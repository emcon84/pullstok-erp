export const NO_NAME_LABEL = "Sin nombre";

/** Nombre para mostrar de un cliente: los clientes pueden no tener nombre. */
export const customerDisplayName = (
  customer: { name?: string | null } | null | undefined,
): string => customer?.name?.trim() || NO_NAME_LABEL;

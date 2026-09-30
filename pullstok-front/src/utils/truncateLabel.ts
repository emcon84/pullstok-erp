/** Recorta etiquetas largas con elipsis; la completa queda en tooltip/tabla. */
export const truncateLabel = (label: string, max: number = 24): string =>
  label.length <= max ? label : `${label.slice(0, max - 1)}…`;

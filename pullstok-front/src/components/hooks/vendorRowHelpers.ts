/**
 * Helpers compartidos de las filas del POS del vendedor (bolsa cerrada y
 * venta suelta). Agrupan el parsing de cantidad decimal (con coma, estilo
 * es-AR), el clamping de porcentajes y el formateo por modo para no duplicar
 * la lógica entre VendorCatalogTab, LooseSellTab y VendorOrderPanel.
 */

/** Parsea un string de cantidad decimal ("0,5" ó "0.5") → number ó NaN. */
export const parseDecimal = (raw: string): number => {
  const v = parseFloat(raw.trim().replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};

/** Clampa un porcentaje de descuento a 0..100. */
export const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

/** Presenta una cantidad en unidades para el input inline de bolsa cerrada. */
export const formatBolsaQty = (qty: number): number =>
  Math.max(1, Math.round(qty));

/**
 * Scrollea `container` para que `row` quede visible (con margen de 24px).
 * Usa `getBoundingClientRect()` (posición real en el viewport) en vez de
 * `offsetTop`/`offsetParent`, que con `<table>` devuelven medidas erráticas.
 * Resta la posición del contenedor a la de la fila, así da el desplazamiento
 * exacto independientemente del anidamiento. `container` debe ser el elemento
 * que realmente scrollea.
 */
export const scrollRowInContainer = (container: HTMLElement, row: HTMLElement) => {
  const cRect = container.getBoundingClientRect();
  const rRect = row.getBoundingClientRect();
  const rowTop = rRect.top - cRect.top;
  const rowBottom = rRect.bottom - cRect.top;
  const viewH = container.clientHeight;
  if (rowTop < 0) {
    container.scrollTop += rowTop - 24;
  } else if (rowBottom > viewH) {
    container.scrollTop += rowBottom - viewH + 24;
  }
};

/**
 * Scrollea el ancestro scrolleable REAL más cercano a `el` para que quede
 * visible (con margen de 24px). Es más confiable que scrollIntoView con tablas
 * anidadas: sube por el DOM hasta encontrar un contenedor que realmente scrollee
 * (overflowY auto/scroll y con contenido que desborda). Si no hay ninguno,
 * cae a scrollIntoView.
 */
export const scrollRowIntoView = (el: HTMLElement) => {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      const rect = el.getBoundingClientRect();
      const cRect = node.getBoundingClientRect();
      if (rect.top < cRect.top) node.scrollTop += rect.top - cRect.top - 24;
      else if (rect.bottom > cRect.bottom) node.scrollTop += rect.bottom - cRect.bottom + 24;
      return;
    }
    node = node.parentElement;
  }
  el.scrollIntoView({ block: "nearest" });
};

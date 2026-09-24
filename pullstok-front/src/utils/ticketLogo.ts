/**
 * Pre-proceso del logo para el ticket térmico.
 *
 * Las térmicas son de 1 bit sobre papel blanco. Un logo CLARO/BLANCO sobre
 * fondo transparente (hecho para el tema oscuro de la app) queda invisible:
 * el blanco sobre el papel blanco no imprime. Acá se detecta ese caso, se
 * invierte la luminancia del trazo y se compone sobre blanco en escala de
 * grises. Si cualquier paso falla (CORS, canvas no disponible, timeout) se
 * devuelve la URL original y el ticket usa el <img> con filtro CSS de respaldo.
 */

/** Ancho máx. del logo en px (~40 mm a 203 dpi). */
const MAX_LOGO_WIDTH_PX = 320;
/** Tope total del pre-proceso: nunca demora la impresión más que esto. */
const PREPARE_TIMEOUT_MS = 3000;
/** Fracción de píxeles opacos desde la cual se considera un fondo sólido. */
const OPAQUE_BACKGROUND_FRACTION = 0.9;
/** Luminancia media (0-1) del trazo visible desde la cual se lo trata como claro. */
const LIGHT_GLYPH_LUMINANCE = 0.6;
/** Estiramiento de contraste leve alrededor del gris medio. */
const CONTRAST = 1.2;

const lum = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * Convierte RGBA en escala de grises opaca sobre blanco, mutando `data`.
 * Un trazo claro sobre fondo mayormente transparente se invierte (queda oscuro).
 */
export function processLogoPixels(data: Uint8ClampedArray): Uint8ClampedArray {
  const total = data.length / 4;
  let opaque = 0;
  let weight = 0;
  let weightedLum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    if (a >= 0.95) opaque++;
    if (a > 0) {
      weight += a;
      weightedLum += a * lum(data[i], data[i + 1], data[i + 2]);
    }
  }

  const invert =
    weight > 0 &&
    opaque / total < OPAQUE_BACKGROUND_FRACTION &&
    weightedLum / weight > LIGHT_GLYPH_LUMINANCE;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    const l = lum(data[i], data[i + 1], data[i + 2]);
    // Composición sobre blanco: lo transparente queda blanco.
    const composed = a * (invert ? 1 - l : l) + (1 - a);
    const stretched = Math.min(1, Math.max(0, (composed - 0.5) * CONTRAST + 0.5));
    const v = Math.round(stretched * 255);
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  return data;
}

/** URL → data URL (fetch → blob → FileReader). Necesita CORS en el origen. */
async function fetchAsDataUrl(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.onabort = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo no decodificable"));
    img.src = src;
  });

/** Alto máx. del logo para el raster ESC/POS (puntos). */
const MAX_BITMAP_HEIGHT_PX = 160;

/**
 * Pipeline compartido: URL → canvas escalado con los píxeles ya procesados
 * (gris sobre blanco). null si algo no está disponible. `maxHeight` es
 * opcional: el ticket HTML no lo necesita, el raster ESC/POS sí.
 */
async function renderLogo(url: string, maxHeight = Infinity) {
  const dataUrl = await fetchAsDataUrl(url);
  if (!dataUrl) return null;
  const img = await loadImage(dataUrl);
  if (!img.naturalWidth || !img.naturalHeight) return null;

  const scale = Math.min(1, MAX_LOGO_WIDTH_PX / img.naturalWidth, maxHeight / img.naturalHeight);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  processLogoPixels(imageData.data);
  return { canvas, ctx, imageData, width, height };
}

/** Pipeline completo a data URL; null si algo no está disponible. */
async function process(url: string): Promise<string | null> {
  const r = await renderLogo(url);
  if (!r) return null;
  r.ctx.putImageData(r.imageData, 0, 0);
  return r.canvas.toDataURL("image/png");
}

/**
 * Devuelve el logo listo para térmica como data URL PNG. Nunca lanza ni
 * bloquea más de ~3 s: ante cualquier problema resuelve con la URL original.
 */
export function prepareTicketLogo(url: string): Promise<string> {
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve(url), PREPARE_TIMEOUT_MS);
    process(url)
      .then((result) => resolve(result ?? url))
      .catch(() => resolve(url))
      .finally(() => clearTimeout(timer));
  });
}

/** Logo ya procesado como píxeles RGBA (para rasterizar a ESC/POS). */
export interface LogoBitmap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Igual que prepareTicketLogo pero entrega los píxeles (RGBA, gris sobre
 * blanco) en vez de un data URL. Nunca lanza ni bloquea más de ~3 s: ante
 * cualquier problema resuelve null y el ticket se imprime sin logo.
 */
export function prepareTicketLogoBitmap(url: string): Promise<LogoBitmap | null> {
  return new Promise<LogoBitmap | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), PREPARE_TIMEOUT_MS);
    renderLogo(url, MAX_BITMAP_HEIGHT_PX)
      .then((r) => resolve(r ? { width: r.width, height: r.height, data: r.imageData.data } : null))
      .catch(() => resolve(null))
      .finally(() => clearTimeout(timer));
  });
}

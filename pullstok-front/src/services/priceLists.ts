import { API_URL } from "../constants";

/**
 * Cliente API de planillas de precios de proveedor
 * (sdd/alican-wholesale-price-list). Plain fetch + token de localStorage,
 * mismo patrón que bulkPriceUpdate en productService.
 */

export type PriceListLayout = "SECO" | "WET";
export type PreviewState =
  | "matched"
  | "unmatched"
  | "multi-match"
  | "duplicado"
  | "error";

export interface PreviewRow {
  position: number; // idTemporal para el apply (D6)
  nombre: string; // nombre ORIGINAL del PDF
  unidadEmpaque: string | null;
  marca: string | null;
  linea: string | null;
  sublinea: string | null;
  precioSinIva: number | null;
  precioConIva: number | null;
  sugerido: number | null;
  estado: PreviewState;
  productId: string | null;
  productIds?: string[];
  matchName?: string | null;
}

export interface PriceListPreview {
  layout: PriceListLayout;
  period: string | null;
  sourceFilename: string;
  total: number;
  rows: PreviewRow[];
}

export interface ApplyDecision {
  position: number;
  accion: "import" | "omit";
  productId?: string;
  nombre: string;
  marca?: string | null;
  linea?: string | null;
  sublinea?: string | null;
  unidadEmpaque?: string | null;
  precioSinIva?: number | null;
  precioConIva?: number | null;
}

export interface ApplyPriceListPayload {
  layout: PriceListLayout;
  period: string | null;
  sourceFilename: string;
  rows: ApplyDecision[];
}

export interface ApplyResult {
  priceListId: string;
  imported: number;
  omitted: number;
  suggestedUpdated: number;
}

export interface PriceListSummary {
  id: string;
  provider: string;
  type: PriceListLayout;
  period: string | null;
  sourceFilename: string;
  importedAt: string;
  sectionsCount: number;
  entriesCount: number;
}

export interface PriceListEntryDetail {
  id: string;
  productId: string | null;
  name: string;
  unit: string | null;
  priceSinIva: number | null;
  priceConIva: number | null;
  suggestedPrice: number | null;
  matched: boolean;
  position: number;
}

export interface PriceListSectionDetail {
  id: string;
  brand: string | null;
  line: string | null;
  subline: string | null;
  position: number;
  entries: PriceListEntryDetail[];
}

export interface PriceListDetail {
  id: string;
  provider: string;
  type: PriceListLayout;
  period: string | null;
  sourceFilename: string;
  importedAt: string;
  sections: PriceListSectionDetail[];
}

export interface AdjustPayload {
  percentage?: number;
  excludeEntryIds: string[];
  entryOverrides: { entryId: string; suggestedPrice: number }[];
}

export interface AdjustRow {
  entryId: string;
  name: string;
  productId: string | null;
  suggestedPrice: number;
  newSuggestedPrice: number;
  delta: number;
}

export interface AdjustResult {
  affected: number;
  previousTotal: number;
  newTotal: number;
  rows?: AdjustRow[];
}

/** Error con status HTTP para distinguir 400/413/404 en la UI. */
export interface ApiError extends Error {
  status?: number;
}

const apiError = (res: Response, fallback: string): ApiError => {
  const err = new Error(fallback) as ApiError;
  err.status = res.status;
  return err;
};

const authHeaders = (json = false): Record<string, string> => {
  const token = localStorage.getItem("token");
  return json
    ? {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }
    : { Authorization: `Bearer ${token}` };
};

/**
 * POST /products/import-price-list — preview (dryRun=true) del PDF subido.
 * Multipart: NO se setea Content-Type (fetch agrega el boundary).
 */
export const importPriceList = async (
  file: File,
  dryRun = true,
): Promise<PriceListPreview> => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(
    `${API_URL}/products/import-price-list?dryRun=${dryRun}`,
    {
      method: "POST",
      headers: authHeaders(false),
      body: formData,
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw apiError(res, data.message || "Error al procesar la planilla");
  }
  return res.json();
};

/** POST /products/import-price-list/apply — decisiones del preview (2 pasos). */
export const applyPriceList = async (
  payload: ApplyPriceListPayload,
): Promise<ApplyResult> => {
  const res = await fetch(`${API_URL}/products/import-price-list/apply`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw apiError(res, data.message || "Error al aplicar la planilla");
  }
  return res.json();
};

/** GET /price-lists — planillas de la org por importedAt desc. */
export const getPriceLists = async (): Promise<{ items: PriceListSummary[] }> => {
  const res = await fetch(`${API_URL}/price-lists`, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw apiError(res, data.message || "Error al listar las planillas");
  }
  return res.json();
};

/** GET /price-lists/:id — detalle con jerarquía del PDF. */
export const getPriceList = async (id: string): Promise<PriceListDetail> => {
  const res = await fetch(`${API_URL}/price-lists/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw apiError(res, data.message || "Error al obtener la planilla");
  }
  return res.json();
};

/** POST /price-lists/:id/adjust — preview (dryRun) o apply del ajuste masivo. */
export const adjustPriceList = async (
  id: string,
  payload: AdjustPayload,
  dryRun: boolean,
): Promise<AdjustResult> => {
  const res = await fetch(
    `${API_URL}/price-lists/${id}/adjust?dryRun=${dryRun}`,
    {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw apiError(res, data.message || "Error al ajustar la planilla");
  }
  return res.json();
};

/** Búsqueda de productos de la org para la asignación manual (GET /products). */
export interface ProductSearchHit {
  id: string;
  name: string;
}

export const searchProducts = async (term: string): Promise<ProductSearchHit[]> => {
  const res = await fetch(
    `${API_URL}/products?name=${encodeURIComponent(term)}&page=1&pageSize=10`,
    { headers: authHeaders() },
  );
  if (!res.ok) return [];
  const data = await res.json();
  // Forma paginada { items, total } cuando vienen page/pageSize.
  if (Array.isArray(data)) return data.map((p) => ({ id: p.id, name: p.name }));
  return (data.items ?? []).map((p: { id: string; name: string }) => ({
    id: p.id,
    name: p.name,
  }));
};

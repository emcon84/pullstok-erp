/**
 * offlineCatalog — catálogo local (Fase 1, SOLO lectura) para que el scanner y
 * la búsqueda de productos funcionen OFFLINE y veloz en el celular.
 *
 * - IndexedDB persiste el snapshot entre sesiones (unos pocos MB, sin imágenes).
 * - En MEMORIA hay Maps id→producto, code→producto, barcode→producto para
 *   lookup O(1) (sin tocar IndexedDB por scan).
 * - `priceKgLista` es el precio por kg de la LISTA de suelto (PriceKgPrice) ya
 *   resuelto por el backend en el snapshot → el scanner lo muestra directo.
 *
 * El sync (fetch del snapshot + store) se dispara desde ensureOfflineCatalog().
 */

import { API_URL } from "../constants";

export interface OfflineVariant {
  value: string;
  variantName: string;
  variantId: string | null;
  optionId: string;
}

export interface OfflineProduct {
  id: string;
  name: string;
  code: string | null;
  barcode: string | null;
  price: number;
  priceKgLista: number | null;
  priceKgSuelto: number | null;
  priceKgSueltoManual: boolean;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  variants: OfflineVariant[];
}

const DB_NAME = "pullstok-offline-v1";
const STORE = "products";
const META = "meta";
const SYNC_TTL_MS = 3 * 60 * 1000; // re-sincronizar si el snapshot tiene >3 min

let products: OfflineProduct[] = [];
let byCode = new Map<string, OfflineProduct>();
let byBarcode = new Map<string, OfflineProduct>();
let lastSync: number | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function rebuildIndexes(list: OfflineProduct[]) {
  products = list;
  byCode = new Map();
  byBarcode = new Map();
  for (const p of list) {
    if (p.code) byCode.set(p.code, p);
    if (p.barcode) byBarcode.set(p.barcode, p);
  }
}

/** Carga el snapshot desde IndexedDB a memoria (si existe). Safe: no-op si IDB no está. */
export async function loadOfflineCatalog(): Promise<void> {
  try {
    const db = await openDb();
    const all = await new Promise<OfflineProduct[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as OfflineProduct[]) || []);
      req.onerror = () => reject(req.error);
    });
    const meta = await new Promise<{ ts: number } | null>((resolve) => {
      try {
        const tx = db.transaction(META, "readonly");
        const req = tx.objectStore(META).get("lastSync");
        req.onsuccess = () => resolve((req.result as { ts: number } | undefined) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    rebuildIndexes(all);
    lastSync = meta ? Number(meta.ts) : null;
  } catch {
    /* IDB no disponible: memoria vacía, se re-sincroniza al validar */
  }
}

/** Guarda el snapshot en IndexedDB y actualiza la memoria. Safe: no-op si IDB no está. */
export async function storeOfflineSnapshot(list: OfflineProduct[]): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, META], "readwrite");
      const store = tx.objectStore(STORE);
      store.clear();
      for (const p of list) store.put(p);
      tx.objectStore(META).put({ key: "lastSync", ts: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    lastSync = Date.now();
    rebuildIndexes(list);
  } catch {
    /* noop */
  }
}

/** ¿Hace falta re-sincronizar? (sin datos, o sync más viejo que el TTL). */
export function isCatalogStale(): boolean {
  return products.length === 0 || lastSync === null || Date.now() - lastSync > SYNC_TTL_MS;
}

export function catalogSize(): number {
  return products.length;
}

export function getLastSync(): number | null {
  return lastSync;
}

/** Busca un producto por code o barcode (Maps en memoria, O(1)). */
export function lookupProductByCode(code: string): OfflineProduct | null {
  if (!code) return null;
  return byCode.get(code) ?? byBarcode.get(code) ?? null;
}

/** Búsqueda por nombre (substring AND de tokens), rankeada por coincidencia. */
export function searchProducts(query: string, limit = 20): OfflineProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const scored: Array<{ p: OfflineProduct; score: number }> = [];
  for (const p of products) {
    const name = p.name.toLowerCase();
    let matched = 0;
    for (const t of tokens) {
      if (name.includes(t)) matched++;
    }
    if (matched !== tokens.length) continue;
    let score = 0;
    if (name.startsWith(q)) score += 3;
    else if (name.includes(q)) score += 2;
    score += matched;
    scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.p);
}

/**
 * Carga el catálogo local y, si está desactualizado (o vacío) y hay internet,
 * re-sincroniza en background. Retorna el tamaño actual para diagnóstico.
 */
export async function ensureOfflineCatalog(): Promise<number> {
  await loadOfflineCatalog();
  if (isCatalogStale() && navigator.onLine) {
    void syncOfflineCatalog().catch(() => {});
  }
  return products.length;
}

/** Descarga el snapshot del backend y lo persiste. Debe haber token + internet. */
export async function syncOfflineCatalog(): Promise<number> {
  const token = localStorage.getItem("token");
  if (!token) return products.length;
  const res = await fetch(`${API_URL}/products/offline-snapshot`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`offline-snapshot failed: ${res.status}`);
  }
  const data = (await res.json()) as OfflineProduct[];
  await storeOfflineSnapshot(data);
  return data.length;
}

/**
 * Upsert de UN SOLO producto (patch puntual, no resync completo): actualiza
 * el array/Maps en MEMORIA de forma incondicional (para que quede buscable
 * ya mismo, incluso si IndexedDB no está disponible en este entorno) y
 * best-effort persiste ese registro en IndexedDB — sin tocar META/lastSync.
 */
export async function patchProduct(product: OfflineProduct): Promise<void> {
  const idx = products.findIndex((p) => p.id === product.id);
  const nextList =
    idx >= 0
      ? products.map((p, i) => (i === idx ? product : p))
      : [...products, product];
  rebuildIndexes(nextList);

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(product);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* IDB no disponible o falló el write: la memoria ya quedó consistente. */
  }
}

/**
 * Saca un producto del catálogo local (borrado real, o ya no pertenece a
 * esta org). Actualiza memoria incondicionalmente y borra best-effort de
 * IndexedDB.
 */
export async function removeProductFromCatalog(id: string): Promise<void> {
  rebuildIndexes(products.filter((p) => p.id !== id));

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* IDB no disponible o falló el delete: la memoria ya quedó consistente. */
  }
}

/**
 * Trae el snapshot individual de UN producto y lo patchea en el catálogo
 * local. Pensado para reaccionar al evento socket `product:changed`
 * (T4). 404 => el producto se borró (o dejó de ser de esta org): lo sacamos
 * del catálogo local en vez de tratarlo como error. Cualquier otro error
 * (HTTP o de red) se loguea y no rompe la UI — mismo espíritu defensivo que
 * el resto del módulo.
 */
export async function fetchAndPatchProduct(id: string): Promise<void> {
  const token = localStorage.getItem("token");
  if (!token) return;
  try {
    const res = await fetch(`${API_URL}/products/${id}/offline-snapshot`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (res.status === 404) {
      await removeProductFromCatalog(id);
      return;
    }
    if (!res.ok) {
      console.error(`fetchAndPatchProduct: offline-snapshot failed (${res.status}) for ${id}`);
      return;
    }
    const data = (await res.json()) as OfflineProduct;
    await patchProduct(data);
  } catch (err) {
    console.error(`fetchAndPatchProduct: error patcheando ${id}`, err);
  }
}

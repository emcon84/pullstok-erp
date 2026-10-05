import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProductPresentation } from "@/types";
import {
  disablePresentations,
  enablePresentations,
  replacePresentations,
  type PresentationInput,
} from "@/services/presentationsService";
import {
  PresentationError,
  validatePresentationSet,
} from "@/components/hooks/presentationHelpers";

/** Editable row: numeric fields are strings so inputs can be partially typed. */
export interface PresentationRow {
  /** Local React key (stable across edits/reorders). */
  key: string;
  /** Server id; absent for rows added in this session. */
  id?: string;
  name: string;
  factor: string;
  price: string;
  wholesalePrice: string;
  /** Locked base row (factor 1): fixed at load time, never inferred from typing. */
  base?: boolean;
}

const MESSAGES: Record<string, string> = {
  PRESENTATIONS_FARMACIA_ONLY: "Solo los productos de la categoría FARMACIA pueden tener presentaciones",
  PRESENTATIONS_NOT_ENABLED: "El producto no tiene presentaciones habilitadas",
  PRESENTATIONS_ALREADY_ENABLED: "El producto ya tiene presentaciones habilitadas",
  PRESENTATION_STOCK_NOT_ZERO:
    "No se pueden deshabilitar las presentaciones mientras haya stock. Poné el stock en 0 en todas las sucursales y volvé a intentar",
  PRESENTATION_BASE_REQUIRED: "Debe haber exactamente una presentación base con factor 1",
  PRESENTATION_BASE_LOCKED: "La presentación base no se puede quitar ni cambiar de factor",
  PRESENTATION_FACTOR_INVALID: "El factor de cada presentación debe ser un entero mayor o igual a 1",
  PRESENTATION_NAME_DUPLICATE: "Hay nombres de presentación repetidos",
  PRESENTATION_NAME_REQUIRED: "Cada presentación necesita un nombre",
  PRESENTATION_PRICE_INVALID: "Cada presentación necesita un precio válido (0 o más)",
  PRESENTATION_NOT_FOUND: "Una de las presentaciones ya no existe. Recargá el producto e intentá de nuevo",
  PRESENTATION_COUNTED_IN_INVALID: "La presentación elegida para contar el stock no es válida",
  PRESENTATIONS_CATEGORY_LOCKED:
    "No se puede cambiar la categoría mientras el producto tenga presentaciones. Deshabilitalas primero",
};

const GENERIC_MESSAGE = "No se pudieron guardar las presentaciones";

/** Spanish message for a server/client error code (fallback: server text, then generic). */
export const presentationErrorMessage = (code?: string, fallback?: string): string =>
  (code && MESSAGES[code]) || fallback || GENERIC_MESSAGE;

let keySeq = 0;
const nextKey = () => `pr-${++keySeq}`;

const toRow = (p: ProductPresentation): PresentationRow => ({
  key: nextKey(),
  id: p.id,
  name: p.name,
  factor: String(p.factor),
  price: String(p.price),
  wholesalePrice: p.wholesalePrice != null ? String(p.wholesalePrice) : "",
  base: p.factor === 1,
});

const initialRows = (list: ProductPresentation[], basePrice: number): PresentationRow[] =>
  list.length > 0
    ? [...list].sort((a, b) => a.sortOrder - b.sortOrder).map(toRow)
    : [{ key: nextKey(), name: "Unidad", factor: "1", price: String(basePrice), wholesalePrice: "", base: true }];

const isBaseRow = (r: PresentationRow) => r.base === true;

/** Validates rows with the server rules and maps them to the API payload. */
const buildInputs = (rows: PresentationRow[]): PresentationInput[] => {
  const inputs = rows.map((r, i) => {
    const price = r.price.trim() === "" ? Number.NaN : Number(r.price);
    const wholesale = r.wholesalePrice.trim() === "" ? null : Number(r.wholesalePrice);
    if (!r.name.trim()) {
      throw new PresentationError("PRESENTATION_NAME_REQUIRED", MESSAGES.PRESENTATION_NAME_REQUIRED);
    }
    if (!Number.isFinite(price) || price < 0 || (wholesale !== null && (!Number.isFinite(wholesale) || wholesale < 0))) {
      throw new PresentationError("PRESENTATION_PRICE_INVALID", MESSAGES.PRESENTATION_PRICE_INVALID);
    }
    const input: PresentationInput = {
      name: r.name.trim(),
      sortOrder: i,
      factor: r.factor.trim() === "" ? Number.NaN : Number(r.factor),
      price,
      wholesalePrice: wholesale,
      isActive: true,
    };
    return r.id ? { id: r.id, ...input } : input;
  });
  validatePresentationSet(inputs);
  return inputs;
};

interface Options {
  productId: string;
  /** ACTIVE presentations of the product (empty when not enabled yet). */
  presentations: ProductPresentation[];
  /** Product price: seeds the base draft when enabling. */
  basePrice: number;
  /** Called after a successful save/enable/disable so the caller can refetch. */
  onChanged?: () => void;
}

export const usePresentationsEditor = ({ productId, presentations, basePrice, onChanged }: Options) => {
  const [rows, setRows] = useState<PresentationRow[]>(() => initialRows(presentations, basePrice));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-seed the draft when the server data changes (after a refetch).
  const signature = useMemo(() => JSON.stringify(presentations), [presentations]);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setRows(initialRows(presentations, basePrice));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { key: nextKey(), name: "", factor: "", price: "", wholesalePrice: "" }]);
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key || isBaseRow(r)));
  }, []);

  const updateRow = useCallback((key: string, patch: Partial<Omit<PresentationRow, "key" | "id" | "base">>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // The base row's factor is locked at 1.
        return isBaseRow(r) ? { ...next, factor: r.factor } : next;
      }),
    );
  }, []);

  const moveRow = useCallback((key: string, delta: -1 | 1) => {
    setRows((prev) => {
      const from = prev.findIndex((r) => r.key === key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }, []);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null);
      setBusy(true);
      try {
        await action();
        onChanged?.();
        return true;
      } catch (e) {
        const err = e as { code?: string; message?: string };
        setError(presentationErrorMessage(err.code, err.message));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const save = useCallback(
    () => run(() => replacePresentations(productId, buildInputs(rows))),
    [run, productId, rows],
  );

  const enable = useCallback(
    (inputs: PresentationInput[], stockCountedIn?: string) =>
      run(() => {
        validatePresentationSet(inputs);
        return enablePresentations(productId, inputs, stockCountedIn);
      }),
    [run, productId],
  );

  const disable = useCallback(() => run(() => disablePresentations(productId)), [run, productId]);

  return { rows, error, busy, isBase: isBaseRow, addRow, removeRow, updateRow, moveRow, save, enable, disable };
};

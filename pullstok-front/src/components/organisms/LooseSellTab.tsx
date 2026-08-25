import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Loader } from "@/components/atoms/loader";
import { toast } from "react-toastify";
import {
  listPriceKgTypes,
  type PriceKgType,
  type PriceKgSpecies,
} from "@/services/priceKgTypes";
import {
  listPriceKgBrands,
  type PriceKgBrand,
} from "@/services/priceKgBrands";
import { getPriceKgPlan } from "@/services/priceKgPlan";
import { listLooseStocks } from "@/services/looseStock";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorRowsKeyboard } from "@/components/hooks/useVendorRowsKeyboard";
import { LooseSellTable, type LooseCellRow } from "@/components/molecules/LooseSellTable";
import { parseDecimal, scrollRowInContainer } from "@/components/hooks/vendorRowHelpers";
import { cn } from "@/lib/utils";

type VendorCart = ReturnType<typeof useVendorCart>;

// Key de la matriz de celdas: misma convención que PriceKgUpdate — especie
// primero porque una marca/tipo AMBOS tiene una celda distinta por planilla.
const cellKeyOf = (
  species: PriceKgSpecies,
  brandId: string,
  typeId: string,
) => `${species}:${brandId}:${typeId}`;

// Una celda retiene su precio (String, para el formato) y el id de la celda
// PriceKgPrice: ese id es el loosePriceId que identifica la línea suelta al
// vender (loose-lines-stock).
interface CellPriceEntry {
  priceKg: string;
  priceKgPriceId: string;
}

const cellPriceEntry = (
  cells: Record<string, CellPriceEntry>,
  species: PriceKgSpecies,
  brandId: string,
  typeId: string,
): CellPriceEntry | undefined => {
  const entry = cells[cellKeyOf(species, brandId, typeId)];
  if (!entry) return undefined;
  if (entry.priceKg.trim() === "") return undefined;
  const n = parseFloat(entry.priceKg);
  if (Number.isNaN(n) || n <= 0) return undefined;
  return entry;
};

// Los tipos se muestran TODOS, cada uno con las especies que le aplican.
const showPerro = (t: PriceKgType) => t.species !== "GATO";
const showGato = (t: PriceKgType) => t.species !== "PERRO";

// ── Buscador "inteligente" de la planilla suelta ──
// Normaliza texto (minúsculas, sin tildes, sin espacios/puntuación) para que
// "Proplan" y "Pro Plan" matcheen, y para cruzar tokens contra marca/tipo/especie.
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

const speciesText = (s: PriceKgSpecies) =>
  s === "PERRO" ? "perro" : s === "GATO" ? "gato" : "perro y gato";

// Matchea una celda (marca × tipo × especie) contra la búsqueda. Cada token de
// la query debe aparecer en el "haystack" (marca + keywords, tipo + synonyms,
// especie + label). Así "pro plan perro adulto" o "Proplan" encuentran la fila.
const looseMatches = (
  brand: PriceKgBrand,
  type: PriceKgType,
  species: PriceKgSpecies,
  query: string,
): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).map(normalize).filter(Boolean);
  if (tokens.length === 0) return true;
  const brandHay = [brand.name, ...(brand.keywords ?? [])].map(normalize).join(" ");
  const typeHay = [type.name, ...(type.synonyms ?? [])].map(normalize).join(" ");
  const spHay = [speciesText(species), species].map(normalize).join(" ");
  const hay = `${brandHay} ${typeHay} ${spHay}`;
  return tokens.every((t) => hay.includes(t));
};

interface LooseSellTabProps {
  /** Sucursal del vendedor (BranchMode single). Definida para el VENDEDOR. */
  branchId: string;
  /** Carrito compartido del POS unificado (la misma instancia de "Por unidad"). */
  cart: VendorCart;
  onSaveOrder: () => void;
  onConfirmSale: () => void;
  /** → salta al panel de pedido. */
  onEnterPanel?: () => void;
  /** Tecla T: cambia de tab (Por unidad ↔ Suelto). */
  onToggleTab?: () => void;
  /** Registra la función para volver al listado desde el panel (←). */
  registerGridApi?: (api: { focusSelectedRow: () => void }) => void;
}

/**
 * Tab "Suelto" del POS unificado: búsqueda de la planilla (marca → tipo/celda)
 * que vende por kg. Reemplaza las cards por una tabla clara (Marca | Tipo |
 * Especie | Precio/kg | Stock | Cantidad) con input inline de kg y roving
 * focus. Agrega al MISMO carrito compartido (prop cart) y ya no usa
 * PriceKgProductPanel (el panel vive siempre visible en UnifiedPos).
 */
export const LooseSellTab = ({
  branchId,
  cart,
  onSaveOrder,
  onConfirmSale,
  onEnterPanel,
  onToggleTab,
  registerGridApi,
}: LooseSellTabProps) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<PriceKgType[]>([]);
  const [brands, setBrands] = useState<PriceKgBrand[]>([]);
  const [cells, setCells] = useState<Record<string, CellPriceEntry>>({});
  // Stock suelto por celda (cellId → kg) precargado en batch con
  // listLooseStocks(branchId). null = la celda no tiene fila de stock.
  const [stockByCell, setStockByCell] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // ── Navegación de filas (roving focus + scroll) ──
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Contenedor scrolleable de la planilla: es el que se desplaza al navegar.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [qtyByKey, setQtyByKey] = useState<Record<string, string>>({});
  // ── Modo de venta suelta: por kilo (POR_PESO, kg) o por monto (POR_MONTO, $) ──
  const [saleMode, setSaleMode] = useState<"POR_PESO" | "POR_MONTO">("POR_PESO");
  // Cada modo guarda su cantidad por separado (una celda puede tener una línea
  // POR_PESO y otra POR_MONTO en el mismo pedido — claves de merge distintas).
  const modeKey = (cellKey: string) => `${cellKey}::${saleMode}`;

  // Tecla M: alterna entre por kilo / por monto.
  const toggleMode = useCallback(() => {
    setSaleMode((m) => (m === "POR_PESO" ? "POR_MONTO" : "POR_PESO"));
  }, []);

  // ── Carga inicial paralela de tipos, marcas, planilla y stock suelto ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [typesData, brandsData, plan, stocks] = await Promise.all([
          listPriceKgTypes(),
          listPriceKgBrands(),
          getPriceKgPlan(),
          listLooseStocks(branchId).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        setTypes(typesData);
        setBrands(brandsData);
        const map: Record<string, CellPriceEntry> = {};
        for (const c of plan) {
          map[cellKeyOf(c.species, c.brandId, c.typeId)] = {
            priceKg: String(c.priceKg),
            priceKgPriceId: c.id,
          };
        }
        setCells(map);
        const stockMap: Record<string, number> = {};
        for (const s of stocks.items) {
          stockMap[s.priceKgPriceId] = s.quantity;
        }
        setStockByCell(stockMap);
      } catch {
        if (cancelled) return;
        setTypes([]);
        setBrands([]);
        setCells({});
        setStockByCell({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  // ── Sync de kg desde el carrito (líneas POR_PESO muestran SU cantidad) ──
  // Índice inverso cellId → cellKey para mapear la línea del carrito a la fila.
  const cellIdToKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [key, entry] of Object.entries(cells)) {
      map[entry.priceKgPriceId] = key;
    }
    return map;
  }, [cells]);

  useEffect(() => {
    setQtyByKey((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const it of cart.items) {
        if (it.saleMode !== "POR_PESO" && it.saleMode !== "POR_MONTO") continue;
        if (!it.loosePriceId) continue;
        const key = cellIdToKey[it.loosePriceId];
        if (!key) continue;
        const k = `${key}::${it.saleMode}`;
        const s = String(it.quantity);
        if (next[k] !== s) {
          next[k] = s;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [cart.items, cellIdToKey]);

  // ── Armado de las filas de la planilla (marcas matcheadas × tipos × especie) ──
  const trimmed = query.trim();
  const rows = useMemo<LooseCellRow[]>(() => {
    // Sin query se muestra TODA la planilla. El filtro es por CELDA (marca × tipo
    // × especie + keywords/synonyms): al escribir, se va acotando en vivo.
    const list: LooseCellRow[] = [];
    for (const b of brands) {
      for (const t of types) {
        for (const sp of ["PERRO", "GATO"] as PriceKgSpecies[]) {
          if (sp === "PERRO" && !showPerro(t)) continue;
          if (sp === "GATO" && !showGato(t)) continue;
          const entry = cellPriceEntry(cells, sp, b.id, t.id);
          if (!entry) continue;
          const priceKg = parseFloat(entry.priceKg);
          if (Number.isNaN(priceKg) || priceKg <= 0) continue;
          if (!looseMatches(b, t, sp, trimmed)) continue;
          list.push({
            cellKey: cellKeyOf(sp, b.id, t.id),
            cellId: entry.priceKgPriceId,
            brandName: b.name,
            typeName: t.name,
            species: sp,
            priceKg,
            stockKg: stockByCell[entry.priceKgPriceId] ?? null,
          });
        }
      }
    }
    return list;
  }, [brands, types, cells, stockByCell, trimmed]);

  // ── Acciones sobre la fila activa ──
  const rowAt = (index: number) => rows[index];

  const setQtyFor = (index: number, value: string) => {
    const r = rowAt(index);
    if (!r) return;
    if (value === "" || /^[\d.,]*$/.test(value)) {
      setQtyByKey((prev) => ({ ...prev, [modeKey(r.cellKey)]: value }));
    }
  };

  const qtyValue = (index: number) => {
    const r = rowAt(index);
    return r ? (qtyByKey[modeKey(r.cellKey)] ?? "1") : "1";
  };

  const increment = (index: number) => {
    const r = rowAt(index);
    if (!r) return;
    const cur = parseDecimal(qtyByKey[modeKey(r.cellKey)] ?? "1");
    const base = Number.isNaN(cur) ? (saleMode === "POR_MONTO" ? 0 : 1) : cur;
    let next: number;
    if (saleMode === "POR_MONTO") {
      // Por monto: la cantidad es el total en $. Tope = stock (kg) × precio/kg.
      const capKg = r.stockKg && r.stockKg > 0 ? r.stockKg : Infinity;
      const cap = capKg === Infinity ? Infinity : Math.round(capKg * r.priceKg * 100) / 100;
      next = Math.min(cap, Math.round((base + 1) * 100) / 100);
    } else {
      const max = r.stockKg && r.stockKg > 0 ? r.stockKg : Infinity;
      next = Math.round(Math.min(max, base + 1) * 100) / 100;
    }
    setQtyByKey((prev) => ({ ...prev, [modeKey(r.cellKey)]: String(next) }));
  };

  const decrement = (index: number) => {
    const r = rowAt(index);
    if (!r) return;
    const cur = parseDecimal(qtyByKey[modeKey(r.cellKey)] ?? "1");
    const base = Number.isNaN(cur) ? (saleMode === "POR_MONTO" ? 0 : 1) : cur;
    const next = Math.max(0, Math.round((base - 1) * 100) / 100);
    setQtyByKey((prev) => ({ ...prev, [modeKey(r.cellKey)]: String(next) }));
  };

  // Ruta loose de addToCart según el modo de venta (kg o monto). El stock del
  // carrito es 0: lo resuelve el backend contra LooseStock. Para POR_MONTO la
  // cantidad es el TOTAL en $ (addToCart guarda price=1 y priceKgSuelto=celda).
  const commit = (index: number) => {
    const r = rowAt(index);
    if (!r) return;
    if ((r.stockKg ?? 0) <= 0) {
      toast.error("Sin stock suelto en esta celda");
      return;
    }
    const cur = parseDecimal(qtyByKey[modeKey(r.cellKey)] ?? "1");
    const value = Number.isNaN(cur) ? 0 : cur;
    if (value <= 0) {
      toast.error(
        saleMode === "POR_MONTO" ? "Ingresá un monto" : "Ingresá una cantidad en kg",
      );
      return;
    }
    const looseName = [r.brandName, r.typeName].filter(Boolean).join(" · ");
    const existing = cart.items.find(
      (i) =>
        i.productId === r.cellId &&
        (i.saleMode ?? "BOLSA_CERRADA") === saleMode &&
        i.loosePriceId === r.cellId,
    );
    if (existing) {
      cart.updateQuantity(r.cellId, value, saleMode, r.cellId);
    } else {
      cart.addToCart(
        {
          _id: r.cellId,
          id: r.cellId,
          name: looseName,
          price: r.priceKg,
          priceKgSuelto: r.priceKg,
          quantity: 0,
          category: "",
        },
        value,
        branchId,
        0,
        saleMode,
        r.priceKg,
        r.cellId,
        looseName,
      );
    }
    toast.success(`"${looseName}" agregado al pedido`);
  };

  // ── Navegación ──
  // Desplaza el contenedor de la planilla por offsetTop (a prueba de anidamiento)
  // para que la fila activa quede visible al navegar con flechas.
  useEffect(() => {
    const container = scrollRef.current;
    const row = rowRefs.current[selectedIndex];
    if (container && row) scrollRowInContainer(container, row);
  }, [selectedIndex]);

  useEffect(() => {
    if (selectedIndex >= 0) {
      inputRefs.current[selectedIndex]?.focus({ preventScroll: true });
    }
  }, [selectedIndex]);

  const registerRow = (index: number, el: HTMLElement | null) => {
    rowRefs.current[index] = el;
  };
  const registerInput = (index: number, el: HTMLInputElement | null) => {
    inputRefs.current[index] = el;
  };

  // ── Vuelta desde el panel (←): enfocar la planilla ──
  const focusSelectedRow = useCallback(() => {
    if (selectedIndex >= 0) inputRefs.current[selectedIndex]?.focus({ preventScroll: true });
    else if (rows.length > 0) setSelectedIndex(0);
  }, [selectedIndex, rows.length]);

  useEffect(() => {
    registerGridApi?.({ focusSelectedRow });
  }, [focusSelectedRow, registerGridApi]);

  const moveSelection = (delta: 1 | -1) => {
    setSelectedIndex((prev) => {
      if (rows.length === 0) return -1;
      if (delta === 1) {
        return prev < 0 ? 0 : Math.min(rows.length - 1, prev + 1);
      }
      return prev <= 0 ? 0 : prev - 1;
    });
  };

  const selectFirst = () => {
    if (rows.length > 0) setSelectedIndex(0);
  };

  // Cambia la búsqueda → resetea selección y cantidades reflejadas.
  useEffect(() => {
    setSelectedIndex(-1);
    rowRefs.current = [];
    inputRefs.current = [];
  }, [trimmed]);

  // ── Teclado (↑/↓ +/− Enter) sobre las filas de la planilla ──
  useVendorRowsKeyboard({
    searchInputRef: searchRef,
    containerRef: rootRef,
    hasRows: rows.length > 0,
    selectedIndex,
    moveDown: () => moveSelection(1),
    moveUp: () => moveSelection(-1),
    selectFirst,
    onIncrement: () => {
      if (selectedIndex >= 0) increment(selectedIndex);
    },
    onDecrement: () => {
      if (selectedIndex >= 0) decrement(selectedIndex);
    },
    onCommitRow: () => {
      if (selectedIndex >= 0) commit(selectedIndex);
    },
    onEnterPanel,
    onToggleTab,
    onToggleMode: toggleMode,
    cartItems: cart.items,
    handleSaveOrder: onSaveOrder,
    handleConfirmSale: onConfirmSale,
  });

  return (
    <div ref={rootRef} className="mx-auto max-w-4xl space-y-6 min-h-0 lg:flex lg:w-full lg:flex-1 lg:flex-col lg:space-y-0">
      <div className="space-y-4 lg:shrink-0">
      {/* Buscador protagonista: input grande con lupa */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          aria-label="Buscar marca"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (rows.length > 0) {
                setSelectedIndex(0);
                commit(0);
              }
            }
          }}
          placeholder="Filtrá por marca, tipo o especie... (ej. Pro plan perro adulto)"
          className="h-12 pl-10 text-lg"
        />
      </div>

      {/* ── Modo de venta suelta: por kilo o por monto ── */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">Modo de venta</span>
        <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
          {(["POR_PESO", "POR_MONTO"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={saleMode === m}
              onClick={() => setSaleMode(m)}
              className={cn(
                "flex-1 whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                saleMode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "POR_PESO" ? "Por kilo" : "Por monto"}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* ── Zona de la planilla: alto fijo + scroll vertical ── */}
      <div
        ref={scrollRef}
        className="min-h-0"
        style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto", position: "relative" }}
      >
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">
            {trimmed
              ? `Sin resultados para "${trimmed}".`
              : "No hay planilla de precios disponible."}
          </p>
        </div>
      ) : (
        <LooseSellTable
          rows={rows}
          selectedIndex={selectedIndex}
          registerRow={registerRow}
          registerInput={registerInput}
          onRowClick={(i) => setSelectedIndex(i)}
          qty={qtyValue}
          onQtyChange={setQtyFor}
          onCommit={commit}
          mode={saleMode}
        />
      )}
      </div>
    </div>
  );
};

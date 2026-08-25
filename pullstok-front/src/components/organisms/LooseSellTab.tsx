import { useEffect, useMemo, useRef, useState } from "react";
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
import { parseDecimal } from "@/components/hooks/vendorRowHelpers";

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

interface LooseSellTabProps {
  /** Sucursal del vendedor (BranchMode single). Definida para el VENDEDOR. */
  branchId: string;
  /** Carrito compartido del POS unificado (la misma instancia de "Por unidad"). */
  cart: VendorCart;
  onSaveOrder: () => void;
  onConfirmSale: () => void;
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
}: LooseSellTabProps) => {
  const searchRef = useRef<HTMLInputElement>(null);
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
  const [qtyByKey, setQtyByKey] = useState<Record<string, string>>({});

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
        if (it.saleMode !== "POR_PESO" || !it.loosePriceId) continue;
        const key = cellIdToKey[it.loosePriceId];
        if (!key) continue;
        const s = String(it.quantity);
        if (next[key] !== s) {
          next[key] = s;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [cart.items, cellIdToKey]);

  // ── Armado de las filas de la planilla (marcas matcheadas × tipos × especie) ──
  const trimmed = query.trim();
  const rows = useMemo<LooseCellRow[]>(() => {
    const list: LooseCellRow[] = [];
    for (const b of brands) {
      if (trimmed && !b.name.toLowerCase().includes(trimmed.toLowerCase())) {
        continue;
      }
      for (const t of types) {
        for (const sp of ["PERRO", "GATO"] as PriceKgSpecies[]) {
          if (sp === "PERRO" && !showPerro(t)) continue;
          if (sp === "GATO" && !showGato(t)) continue;
          const entry = cellPriceEntry(cells, sp, b.id, t.id);
          if (!entry) continue;
          const priceKg = parseFloat(entry.priceKg);
          if (Number.isNaN(priceKg) || priceKg <= 0) continue;
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
      setQtyByKey((prev) => ({ ...prev, [r.cellKey]: value }));
    }
  };

  const qtyValue = (index: number) => {
    const r = rowAt(index);
    return r ? (qtyByKey[r.cellKey] ?? "1") : "1";
  };

  const increment = (index: number) => {
    const r = rowAt(index);
    if (!r) return;
    const cur = parseDecimal(qtyByKey[r.cellKey] ?? "1");
    const base = Number.isNaN(cur) ? 1 : cur;
    const max = r.stockKg && r.stockKg > 0 ? r.stockKg : Infinity;
    const next = Math.round(Math.min(max, base + 1) * 100) / 100;
    setQtyByKey((prev) => ({ ...prev, [r.cellKey]: String(next) }));
  };

  const decrement = (index: number) => {
    const r = rowAt(index);
    if (!r) return;
    const cur = parseDecimal(qtyByKey[r.cellKey] ?? "1");
    const base = Number.isNaN(cur) ? 1 : cur;
    const next = Math.max(0, Math.round((base - 1) * 100) / 100);
    setQtyByKey((prev) => ({ ...prev, [r.cellKey]: String(next) }));
  };

  // Ruta loose de addToCart: id de celda (loosePriceId), modo POR_PESO y el
  // precio de la celda como override (C-05). El stock del carrito es 0: lo
  // resuelve el backend contra LooseStock.
  const commit = (index: number) => {
    const r = rowAt(index);
    if (!r) return;
    if ((r.stockKg ?? 0) <= 0) {
      toast.error("Sin stock suelto en esta celda");
      return;
    }
    const cur = parseDecimal(qtyByKey[r.cellKey] ?? "1");
    const qty = Number.isNaN(cur) ? 0 : cur;
    if (qty <= 0) {
      toast.error("Ingresá una cantidad en kg");
      return;
    }
    const looseName = [r.brandName, r.typeName].filter(Boolean).join(" · ");
    const existing = cart.items.find(
      (i) => i.productId === r.cellId && i.saleMode === "POR_PESO",
    );
    if (existing) {
      cart.updateQuantity(r.cellId, qty, "POR_PESO", r.cellId);
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
        qty,
        branchId,
        0,
        "POR_PESO",
        r.priceKg,
        r.cellId,
        looseName,
      );
    }
    toast.success(`"${looseName}" agregado al pedido`);
  };

  // ── Navegación ──
  useEffect(() => {
    if (selectedIndex >= 0) {
      rowRefs.current[selectedIndex]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (selectedIndex >= 0) {
      inputRefs.current[selectedIndex]?.focus();
    }
  }, [selectedIndex]);

  const registerRow = (index: number, el: HTMLElement | null) => {
    rowRefs.current[index] = el;
  };
  const registerInput = (index: number, el: HTMLInputElement | null) => {
    inputRefs.current[index] = el;
  };

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
    cartItems: cart.items,
    handleSaveOrder: onSaveOrder,
    handleConfirmSale: onConfirmSale,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Buscador protagonista: input grande con lupa */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          autoFocus
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
          placeholder="Buscá una marca... (ej. Pro Plan, Royal Canin)"
          className="h-12 pl-10 text-lg"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : trimmed === "" ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">
            Escribí el nombre de una marca para ver sus precios por kilo.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">
            Sin resultados para &quot;{trimmed}&quot;.
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
        />
      )}
    </div>
  );
};

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "react-toastify";
import { Loader } from "@/components/atoms/loader";
import { ProductDrawer } from "@/components/molecules/ProductDrawer";
import { FilterChips } from "@/components/molecules/FilterChips";
import { VendorSearchBar } from "@/components/molecules/VendorSearchBar";
import { ProductTable } from "@/components/molecules/ProductTable";
import { useVendorCatalog } from "@/components/hooks/useVendorCatalog";
import { useVendorRowsKeyboard } from "@/components/hooks/useVendorRowsKeyboard";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import {
  branchQty,
  VENDOR_FILTER_KEY,
  type StoredFilter,
} from "@/components/hooks/vendorCatalogHelpers";
import { parseDecimal, formatBolsaQty } from "@/components/hooks/vendorRowHelpers";
import type { DataItem } from "@/types";

type VendorCart = ReturnType<typeof useVendorCart>;

interface VendorCatalogTabProps {
  branchId: string;
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
 * Tab "Por unidad" del POS unificado: catálogo de bolsas con carga INLINE (sin
 * modal). Cada fila tiene un input de cantidad (↑/↓ navegan con roving focus,
 * +/− lo ajustan y Enter/click lo agrega al pedido). Reusa los mismos hooks
 * que VendorDashboard, pero el carrito/checkout viven arriba (UnifiedPos) para
 * compartir el MISMO carrito con la tab "Suelto". Dueño del teclado (P/V).
 */
export const VendorCatalogTab = ({
  branchId,
  cart,
  onSaveOrder,
  onConfirmSale,
  onEnterPanel,
  onToggleTab,
  registerGridApi,
}: VendorCatalogTabProps) => {
  const navigate = useNavigate();
  const catalog = useVendorCatalog(branchId);
  const rootRef = useRef<HTMLDivElement>(null);

  // ── Cantidades inline (string por fila, sync desde el carrito) ──
  const [qtyByKey, setQtyByKey] = useState<Record<string, string>>({});
  // Refs de los inputs de cantidad para el foco (roving) y del carrito para el
  // sync de valores (los ítems en el carrito muestran su cantidad al input).
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // El scroll del `selectedIndex` ya lo hace useVendorCatalog (itemRefs). Acá
  // solo movemos el FOCO al input de la fila activa cuando cambia la selección.
  useEffect(() => {
    if (catalog.selectedIndex >= 0) {
      inputRefs.current[catalog.selectedIndex]?.focus();
    }
  }, [catalog.selectedIndex]);

  // Sync: los items BOLSA_CERRADA del carrito muestran SU cantidad en el input
  // (la fuente de verdad del pedido). Los que no están, arrancan en "1".
  useEffect(() => {
    setQtyByKey((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const it of cart.items) {
        if ((it.saleMode ?? "BOLSA_CERRADA") !== "BOLSA_CERRADA") continue;
        const key = it.productId;
        const s = String(formatBolsaQty(it.quantity));
        if (next[key] !== s) {
          next[key] = s;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [cart.items]);

  const keyOf = useCallback((p: DataItem) => (p._id || p.id) || "", []);

  const bolsaItemFor = useCallback(
    (p: DataItem) =>
      cart.items.find(
        (i) =>
          i.productId === keyOf(p) &&
          (i.saleMode ?? "BOLSA_CERRADA") === "BOLSA_CERRADA",
      ),
    [cart.items, keyOf],
  );

  const setQtyFor = useCallback(
    (index: number, value: string) => {
      const p = catalog.items[index];
      if (!p) return;
      if (value === "" || /^\d*$/.test(value)) {
        setQtyByKey((prev) => ({ ...prev, [keyOf(p)]: value }));
      }
    },
    [catalog.items, keyOf],
  );

  const qtyValue = useCallback(
    (index: number) => {
      const p = catalog.items[index];
      return p ? (qtyByKey[keyOf(p)] ?? "1") : "1";
    },
    [catalog.items, qtyByKey, keyOf],
  );

  const increment = useCallback(
    (index: number) => {
      const p = catalog.items[index];
      if (!p) return;
      const key = keyOf(p);
      const cur = parseDecimal(qtyByKey[key] ?? "1");
      const base = Number.isNaN(cur) ? 1 : Math.max(1, Math.round(cur));
      const stock = branchQty(p);
      const max = stock > 0 ? stock : Infinity;
      setQtyByKey((prev) => ({ ...prev, [key]: String(Math.min(max, base + 1)) }));
    },
    [catalog.items, qtyByKey, keyOf],
  );

  const decrement = useCallback(
    (index: number) => {
      const p = catalog.items[index];
      if (!p) return;
      const key = keyOf(p);
      const cur = parseDecimal(qtyByKey[key] ?? "1");
      const base = Number.isNaN(cur) ? 1 : Math.max(1, Math.round(cur));
      setQtyByKey((prev) => ({ ...prev, [key]: String(Math.max(1, base - 1)) }));
    },
    [catalog.items, qtyByKey, keyOf],
  );

  const commit = useCallback(
    (index: number) => {
      const p = catalog.items[index];
      if (!p) return;
      const stock = branchQty(p);
      if (stock <= 0) {
        toast.error("Producto sin stock");
        return;
      }
      const key = keyOf(p);
      const cur = parseDecimal(qtyByKey[key] ?? "1");
      const qty = Number.isNaN(cur) ? 1 : Math.max(1, Math.round(cur));
      const existing = bolsaItemFor(p);
      if (existing) {
        cart.updateQuantity(key, qty);
      } else {
        cart.addToCart(p, qty, branchId, stock, "BOLSA_CERRADA");
      }
      toast.success(`"${p.name}" agregado al pedido`);
    },
    [catalog.items, qtyByKey, keyOf, bolsaItemFor, cart, branchId],
  );

  const registerInput = useCallback((index: number, el: HTMLInputElement | null) => {
    inputRefs.current[index] = el;
  }, []);

  // ── Vuelta desde el panel (←): enfocar el listado ──
  // Si hay fila activa la enfoca; si no, selecciona la primera (el efecto la
  // enfoca). Garantiza que ← desde el panel siempre vuelva a la planilla.
  const focusSelectedRow = useCallback(() => {
    if (catalog.selectedIndex >= 0) {
      inputRefs.current[catalog.selectedIndex]?.focus();
    } else if (catalog.items.length > 0) {
      catalog.setSelectedIndex(0);
    }
  }, [catalog.selectedIndex, catalog.items.length, catalog.setSelectedIndex]);

  useEffect(() => {
    registerGridApi?.({ focusSelectedRow });
  }, [focusSelectedRow, registerGridApi]);

  const enabled = useCallback((index: number) => {
    const p = catalog.items[index];
    return !!p && branchQty(p) > 0;
  }, [catalog.items]);

  // Memoizado para no perder el memo de ProductTable en cada tecla del
  // buscador (el valor de la fila cambia solo al editar su cantidad o al
  // cambiar el listado).
  const inlineQty = useMemo(
    () => ({
      value: qtyValue,
      onChange: setQtyFor,
      onCommit: commit,
      registerInput,
      disabled: enabled,
    }),
    [qtyValue, setQtyFor, commit, registerInput, enabled],
  );

  // ── Teclado (↑/↓ +/− Enter) sobre las filas ──
  useVendorRowsKeyboard({
    searchInputRef: catalog.searchInputRef,
    containerRef: rootRef,
    hasRows: catalog.items.length > 0,
    selectedIndex: catalog.selectedIndex,
    moveDown: () => catalog.moveSelection(1),
    moveUp: () => catalog.moveSelection(-1),
    selectFirst: () => catalog.selectFirst(),
    onIncrement: () => {
      if (catalog.selectedIndex >= 0) increment(catalog.selectedIndex);
    },
    onDecrement: () => {
      if (catalog.selectedIndex >= 0) decrement(catalog.selectedIndex);
    },
    onCommitRow: () => {
      if (catalog.selectedIndex >= 0) commit(catalog.selectedIndex);
    },
    onEnterPanel,
    onToggleTab,
    cartItems: cart.items,
    handleSaveOrder: onSaveOrder,
    handleConfirmSale: onConfirmSale,
  });

  // ProductDrawer for viewing stock across all branches
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProduct, setDrawerProduct] = useState<DataItem | null>(null);

  const openDrawer = useCallback((product: DataItem) => {
    setDrawerProduct(product);
    setDrawerOpen(true);
  }, []);

  const resetSelection = useCallback(() => {
    catalog.resetSelection();
    inputRefs.current = [];
  }, [catalog]);

  const handleRowClick = useCallback(
    (index: number) => {
      catalog.setSelectedIndex(index);
    },
    [catalog.setSelectedIndex],
  );

  const searchEnter = useCallback(
    (product: DataItem) => {
      const idx = catalog.items.findIndex(
        (p) => (p._id || p.id) === (product._id || product.id),
      );
      if (idx >= 0) {
        catalog.setSelectedIndex(idx);
        commit(idx);
      }
    },
    [catalog.items, catalog.setSelectedIndex, commit],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      catalog.setFilter(value);
      resetSelection();
    },
    [catalog.setFilter, resetSelection],
  );

  const handleFilterChange = useCallback(
    (f: string) => {
      catalog.setFilter(f);
      resetSelection();
    },
    [catalog.setFilter, resetSelection],
  );

  const handleCategoryChange = useCallback(
    (c: string) => {
      catalog.setCategoryFilter(c);
      resetSelection();
    },
    [catalog.setCategoryFilter, resetSelection],
  );

  const handleTitleChange = useCallback(
    (key: string | null) => {
      catalog.setTitleFilter(key);
      resetSelection();
    },
    [catalog.setTitleFilter, resetSelection],
  );

  const handleClearFilters = useCallback(() => {
    catalog.setFilter("");
    catalog.setCategoryFilter("");
    catalog.setTitleFilter(null);
    resetSelection();
  }, [catalog.setFilter, catalog.setCategoryFilter, catalog.setTitleFilter, resetSelection]);

  const handleAssignBarcode = useCallback(
    (product: DataItem) => {
      const id = product._id || product.id;
      sessionStorage.setItem(
        VENDOR_FILTER_KEY,
        JSON.stringify({
          filter: catalog.filter,
          categoryFilter: catalog.categoryFilter,
          branchId,
        } satisfies StoredFilter),
      );
      navigate(`/scanner?assignTo=${id}`);
    },
    [catalog.filter, catalog.categoryFilter, branchId, navigate],
  );

  if (catalog.isLoadingInitial) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="space-y-4 min-h-0 lg:flex lg:flex-1 lg:flex-col lg:space-y-0">
      {/* ── Search + filters (fijos arriba; la lista scrollea debajo) ── */}
      <div className="z-20 space-y-4 border-b bg-background px-4 pb-3 pt-3 sm:px-6 lg:px-8 lg:shrink-0">
        <VendorSearchBar
          value={catalog.filter}
          onChange={handleSearchChange}
          selectedIndex={catalog.selectedIndex}
          items={catalog.items}
          onOpenQty={searchEnter}
          inputRef={catalog.searchInputRef}
        />
        <FilterChips
          products={catalog.items}
          quickCategories={catalog.facetsCategories.map((c) => c.name)}
          quickVariants={catalog.facetsVariants}
          titles={catalog.facetsTitles}
          titleFilter={catalog.titleFilter}
          onTitleChange={handleTitleChange}
          filter={catalog.filter}
          categoryFilter={catalog.categoryFilter}
          onFilterChange={handleFilterChange}
          onCategoryChange={handleCategoryChange}
          onClear={handleClearFilters}
        />
      </div>

      {/* ── Zona de la lista: scrollea internamente en desktop ── */}
      <div ref={catalog.scrollRef} className="min-h-0 lg:flex-1 lg:overflow-y-auto">
        {/* ── Product grid ── */}
        {catalog.items.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-muted-foreground">
              {catalog.filter || catalog.categoryFilter || catalog.titleFilter
                ? "Sin resultados con estos filtros."
                : "No hay productos."}
            </p>
            {(catalog.filter || catalog.categoryFilter || catalog.titleFilter) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  catalog.setFilter("");
                  catalog.setCategoryFilter("");
                  catalog.setTitleFilter(null);
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          <ProductTable
            items={catalog.items}
            cartItems={cart.items}
            selectedIndex={catalog.selectedIndex}
            registerRow={catalog.registerRow}
            onRowClick={handleRowClick}
            onOpenDrawer={openDrawer}
            onAssignBarcode={handleAssignBarcode}
            inlineQty={inlineQty}
          />
        )}

        {/* ── Infinite scroll: sentinel + "load more" footer ── */}
        {catalog.hasNextPage && (
          <div className="flex items-center justify-center py-6">
            {catalog.isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader />
                <span>Cargando más…</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Desplazate para cargar más productos
              </span>
            )}
          </div>
        )}
        <div ref={catalog.sentinelRef} className="h-1" aria-hidden="true" />
      </div>

      {/* ── Product Drawer (stock across all branches) ── */}
      <ProductDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerProduct(null);
        }}
        product={drawerProduct}
        readOnly
      />
    </div>
  );
};

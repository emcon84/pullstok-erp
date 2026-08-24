import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/atoms/loader";
import { ProductDrawer } from "@/components/molecules/ProductDrawer";
import { FilterChips } from "@/components/molecules/FilterChips";
import { VendorSearchBar } from "@/components/molecules/VendorSearchBar";
import { ProductTable } from "@/components/molecules/ProductTable";
import { QuantityModal } from "@/components/molecules/QuantityModal";
import { useVendorCatalog } from "@/components/hooks/useVendorCatalog";
import { useVendorQuantityModal } from "@/components/hooks/useVendorQuantityModal";
import { useVendorKeyboard } from "@/components/hooks/useVendorKeyboard";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import {
  branchQty,
  VENDOR_FILTER_KEY,
  type StoredFilter,
} from "@/components/hooks/vendorCatalogHelpers";
import type { DataItem } from "@/types";

type VendorCart = ReturnType<typeof useVendorCart>;

interface VendorCatalogTabProps {
  branchId: string;
  cart: VendorCart;
  onSaveOrder: () => void;
  onConfirmSale: () => void;
  onOpenCart: (open: boolean) => void;
}

/**
 * Tab "Por unidad" del POS unificado: el catálogo de bolsas (búsqueda + facets +
 * tabla + modal de cantidad + venta directa 1-tap). Reusa los mismos hooks que
 * VendorDashboard, pero el carrito/checkout/FAB viven arriba (UnifiedPos) para
 * compartir el MISMO carrito con la tab "Suelto". Propietario del teclado
 * (C/P/V): solo está montada mientras la tab está activa.
 */
export const VendorCatalogTab = ({
  branchId,
  cart,
  onSaveOrder,
  onConfirmSale,
  onOpenCart,
}: VendorCatalogTabProps) => {
  const navigate = useNavigate();
  const catalog = useVendorCatalog(branchId);
  const {
    qtyModal,
    qty,
    setQty,
    directSelling,
    saleMode,
    setSaleMode,
    amount,
    setAmount,
    openQtyModal,
    closeQtyModal,
    confirmAddToCart,
    handleDirectSale,
  } = useVendorQuantityModal({
    branchId,
    searchInputRef: catalog.searchInputRef,
    addToCart: cart.addToCart,
  });

  useVendorKeyboard({
    qtyModal,
    qty,
    setQty,
    items: catalog.items,
    selectedIndex: catalog.selectedIndex,
    setSelectedIndex: catalog.setSelectedIndex,
    searchInputRef: catalog.searchInputRef,
    cartItems: cart.items,
    confirmAddToCart,
    handleDirectSale,
    handleSaveOrder: onSaveOrder,
    handleConfirmSale: onConfirmSale,
    openQtyModal,
    branchQty,
    setCartOpen: onOpenCart,
  });

  // ProductDrawer for viewing stock across all branches
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProduct, setDrawerProduct] = useState<DataItem | null>(null);

  const openDrawer = useCallback((product: DataItem) => {
    setDrawerProduct(product);
    setDrawerOpen(true);
  }, []);

  const handleRowClick = useCallback(
    (index: number, product: DataItem) => {
      catalog.setSelectedIndex(index);
      openQtyModal(product);
    },
    [catalog.setSelectedIndex, openQtyModal],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      catalog.setFilter(value);
      catalog.resetSelection();
    },
    [catalog.setFilter, catalog.resetSelection],
  );

  const handleFilterChange = useCallback(
    (f: string) => {
      catalog.setFilter(f);
      catalog.resetSelection();
    },
    [catalog.setFilter, catalog.resetSelection],
  );

  const handleCategoryChange = useCallback(
    (c: string) => {
      catalog.setCategoryFilter(c);
      catalog.resetSelection();
    },
    [catalog.setCategoryFilter, catalog.resetSelection],
  );

  const handleTitleChange = useCallback(
    (key: string | null) => {
      catalog.setTitleFilter(key);
      catalog.resetSelection();
    },
    [catalog.setTitleFilter, catalog.resetSelection],
  );

  const handleClearFilters = useCallback(() => {
    catalog.setFilter("");
    catalog.setCategoryFilter("");
    catalog.setTitleFilter(null);
    catalog.resetSelection();
  }, [catalog.setFilter, catalog.setCategoryFilter, catalog.setTitleFilter, catalog.resetSelection]);

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
    <div className="space-y-4">
      {/* ── Search + filters (sticky) ── */}
      <div className="sticky top-16 lg:top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 space-y-4 border-b bg-background px-4 pb-3 pt-3 sm:px-6 lg:px-8">
        <VendorSearchBar
          value={catalog.filter}
          onChange={handleSearchChange}
          selectedIndex={catalog.selectedIndex}
          items={catalog.items}
          onOpenQty={openQtyModal}
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
          onOpenQty={openQtyModal}
          onOpenDrawer={openDrawer}
          onAssignBarcode={handleAssignBarcode}
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

      {/* ── Quantity modal ── */}
      <QuantityModal
        product={qtyModal?.product ?? null}
        qty={qty}
        setQty={setQty}
        maxStock={qtyModal ? branchQty(qtyModal.product) : 0}
        directSelling={directSelling}
        saleMode={saleMode}
        setSaleMode={setSaleMode}
        amount={amount}
        setAmount={setAmount}
        onDirectSale={handleDirectSale}
        onAddToCart={confirmAddToCart}
        onClose={closeQtyModal}
      />

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

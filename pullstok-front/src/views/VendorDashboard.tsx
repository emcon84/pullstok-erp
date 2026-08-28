import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/atoms/loader";
import { ProductDrawer } from "@/components/molecules/ProductDrawer";
import { FilterChips } from "@/components/molecules/FilterChips";
import { VendorSearchBar } from "@/components/molecules/VendorSearchBar";
import { ProductTable } from "@/components/molecules/ProductTable";
import { QuantityModal } from "@/components/molecules/QuantityModal";
import { VendorCartSheet } from "@/components/molecules/VendorCartSheet";
import { useVendorCatalog } from "@/components/hooks/useVendorCatalog";
import { useVendorQuantityModal } from "@/components/hooks/useVendorQuantityModal";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useVendorKeyboard } from "@/components/hooks/useVendorKeyboard";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import {
  branchQty,
  VENDOR_FILTER_KEY,
  type StoredFilter,
} from "@/components/hooks/vendorCatalogHelpers";
import type { DataItem } from "@/types";

interface VendorDashboardProps {
  branchId: string;
}

export const VendorDashboard = ({ branchId }: VendorDashboardProps) => {
  const navigate = useNavigate();
  const catalog = useVendorCatalog(branchId);
  const cart = useVendorCart();
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
  const [cartOpen, setCartOpen] = useState(false);
  const checkout = useVendorCheckout({
    branchId,
    cartOpen,
    setCartOpen,
    cartItems: cart.items,
    clearCart: cart.clearCart,
    totalAmount: cart.totalAmount,
  });
  // Caja OPEN del vendedor (R8/R9): se propaga al confirmar la venta.
  const { session: currentSession } = useGetCurrentCashSession(branchId);

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
    handleSaveOrder: checkout.handleSaveOrder,
    handleConfirmSale: checkout.handleConfirmSale,
    openQtyModal,
    branchQty,
    setCartOpen,
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
      // Server-side: el título se envía como ?title=<key> junto con los demás
      // filtros (AND). Toggle del chip activo deselecciona (null) y refetchea.
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

  // ── Loading (initial only) ──
  if (catalog.isLoadingInitial) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        <p className="text-sm text-muted-foreground">
          Buscá productos y agregalos al pedido
        </p>
      </div>

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
        {/* "Solo lo que trabajo": oculta productos desmarcados (carried=false) */}
        <div className="flex items-center gap-2">
          <Switch
            id="only-carried"
            checked={catalog.onlyCarried}
            onCheckedChange={(v) => {
              catalog.setOnlyCarried(v);
              catalog.resetSelection();
            }}
          />
          <Label htmlFor="only-carried" className="cursor-pointer text-sm font-medium">
            Solo lo que trabajo
          </Label>
          {!catalog.onlyCarried && (
            <span className="text-xs text-muted-foreground">
              Mostrando todo el catálogo
            </span>
          )}
        </div>
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

      {/* ── Cart FAB ── */}
      {cart.itemCount > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1">
          {/* Radar rings */}
          <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-primary/20" />
          <span className="absolute inset-0 -m-6 animate-ping rounded-full bg-primary/10 [animation-delay:300ms]" />
          {/* Button */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-lg hover:bg-primary/90 transition-all active:scale-95 touch-manipulation"
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="font-semibold text-sm">{cart.itemCount}</span>
            <span className="hidden sm:inline text-sm">
              — ${cart.totalAmount.toLocaleString("es-AR")}
            </span>
          </button>
        </div>
      )}

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

      {/* ── Cart slide-over ── */}
      <VendorCartSheet
        open={cartOpen}
        cart={{
          items: cart.items,
          totalAmount: cart.totalAmount,
        }}
        status={{
          confirming: checkout.confirming,
          savingOrder: checkout.savingOrder,
        }}
        handlers={{
          onOpenChange: setCartOpen,
          updateQty: cart.updateQuantity,
          remove: cart.removeFromCart,
          clearCart: cart.clearCart,
          saveOrder: checkout.handleSaveOrder,
          confirmSale: checkout.handleConfirmSale,
        }}
        cashSessionId={currentSession?.id}
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

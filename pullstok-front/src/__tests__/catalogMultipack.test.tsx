import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductTable } from "@/components/molecules/ProductTable";
import { VendorCatalogTab } from "@/components/organisms/VendorCatalogTab";
import { useVendorCatalog } from "@/components/hooks/useVendorCatalog";
import type { DataItem } from "@/types";
import type { VendorCartItem } from "@/components/hooks/useVendorCart";

// sdd/venta-por-unidad-multpack — UX: el modo de venta Caja/Por unidad pasa a
// un SWITCH GLOBAL "Pouch por unidad" (como "Solo lo que trabajo"). Se ELIMINA
// el par de mini-botones por fila. El catálogo, según el switch, vende
// BOLSA_CERRADA (con precio de caja + stock "cajas") o POR_UNIDAD (precio
// unitario + stock "u."). Los productos NO elegibles (unitsPerBox<=1) quedan
// intactos: siempre caja + unidades.

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock("@/components/hooks/useVendorCatalog", () => ({
  useVendorCatalog: vi.fn(),
}));
vi.mock("@/components/hooks/useVendorRowsKeyboard", () => ({
  useVendorRowsKeyboard: vi.fn(),
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/components/molecules/ProductDrawer", () => ({
  ProductDrawer: () => <div data-testid="product-drawer" />,
}));

const eligible: DataItem = {
  _id: "p-multipack",
  name: "FELIX POUCH PESC X 15x85grs",
  code: "F-15",
  price: 18400,
  quantity: 0,
  unitsPerBox: 15,
  perUnitPrice: 1226.67,
  stocks: [{ quantity: 150 }],
};

const noStock: DataItem = {
  ...eligible,
  _id: "p-nostock",
  stocks: [{ quantity: 0 }],
};

const plain: DataItem = {
  _id: "p-plain",
  name: "Bolsa simple",
  code: "S-1",
  price: 4500,
  quantity: 0,
  stocks: [{ quantity: 20 }],
};

function inlineQty(commit = vi.fn()) {
  return {
    value: () => "1",
    onChange: vi.fn(),
    onCommit: commit,
    registerInput: vi.fn(),
    disabled: () => false,
  };
}

function renderTable(items: DataItem[], extra?: Record<string, unknown>) {
  return render(
    <ProductTable
      items={items}
      cartItems={[] as VendorCartItem[]}
      selectedIndex={0}
      registerRow={vi.fn()}
      onRowClick={vi.fn()}
      onOpenDrawer={vi.fn()}
      onAssignBarcode={vi.fn()}
      inlineQty={inlineQty()}
      {...extra}
    />,
  );
}

describe("ProductTable — switch global 'Pouch por unidad'", () => {
  it("unitMode OFF + elegible → precio de caja + stock en cajas", () => {
    renderTable([eligible], { unitMode: false });
    expect(screen.getAllByText(/\$18\.400/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("10 cajas").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/por unidad/)).not.toBeInTheDocument();
  });

  it("unitMode ON + elegible → precio unitario + sufijo 'por unidad' + stock en unidades", () => {
    renderTable([eligible], { unitMode: true });
    expect(screen.getAllByText(/\$1\.226,67/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/por unidad/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("150 u.").length).toBeGreaterThanOrEqual(1);
  });

  it("no elegible (unitMode ON) → mismo precio + sufijo 'por unidad' (consistente)", () => {
    renderTable([plain], { unitMode: true });
    expect(screen.getAllByText(/\$4\.500/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("20 u.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/por unidad/).length).toBeGreaterThanOrEqual(1);
  });

  it("los botones 'Caja' y 'Por unidad' por fila ya NO se renderizan", () => {
    renderTable([eligible], { unitMode: true });
    expect(screen.queryByText("Caja")).not.toBeInTheDocument();
    expect(screen.queryByText("Por unidad")).not.toBeInTheDocument();
  });

  it("sin stock → 'Sin stock' independiente del modo", () => {
    renderTable([noStock], { unitMode: false });
    expect(screen.getAllByText("Sin stock").length).toBeGreaterThanOrEqual(1);
  });

  it("sin stock (unitMode ON) → 'Sin stock'", () => {
    renderTable([noStock], { unitMode: true });
    expect(screen.getAllByText("Sin stock").length).toBeGreaterThanOrEqual(1);
  });
});

// ── VendorCatalogTab: el switch global vive acá ──
const mockUseVendorCatalog = vi.mocked(useVendorCatalog);

function makeCatalog(overrides: Record<string, unknown> = {}) {
  return {
    filter: "",
    setFilter: vi.fn(),
    categoryFilter: "",
    setCategoryFilter: vi.fn(),
    titleFilter: null as string | null,
    setTitleFilter: vi.fn(),
    onlyCarried: false,
    setOnlyCarried: vi.fn(),
    items: [eligible],
    isLoadingInitial: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    loadMore: vi.fn(),
    selectedIndex: -1,
    setSelectedIndex: vi.fn(),
    searchInputRef: { current: null },
    sentinelRef: { current: null },
    resetSelection: vi.fn(),
    registerRow: vi.fn(),
    facetsCategories: [],
    facetsVariants: [],
    facetsTitles: [],
    ...overrides,
  };
}

function renderCatalogTab(overrides: Record<string, unknown> = {}) {
  const catalog = makeCatalog(overrides);
  mockUseVendorCatalog.mockReturnValue(catalog as never);
  const cart = {
    items: [],
    totalAmount: 0,
    itemCount: 0,
    addToCart: vi.fn(),
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
  };
  render(
    <VendorCatalogTab
      branchId="b1"
      cart={cart as never}
      onSaveOrder={vi.fn()}
      onConfirmSale={vi.fn()}
      onToggleTab={vi.fn()}
      registerGridApi={vi.fn()}
    />,
  );
  return { catalog, cart };
}

describe("VendorCatalogTab — switch global 'Pouch por unidad'", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza el switch 'Pouch por unidad' junto a 'Solo lo que trabajo'", () => {
    renderCatalogTab();
    expect(screen.getByText("Pouch por unidad")).toBeInTheDocument();
    expect(screen.getByText("Solo lo que trabajo")).toBeInTheDocument();
  });

  it("activar 'Pouch por unidad' resetea la selección del catálogo", () => {
    const { catalog } = renderCatalogTab();
    fireEvent.click(screen.getByText("Pouch por unidad"));
    expect(catalog.resetSelection).toHaveBeenCalled();
  });
});

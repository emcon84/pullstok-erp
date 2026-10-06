import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/components/organisms/VendorCatalogTab", () => ({
  VendorCatalogTab: () => <div data-testid="catalog-tab" />,
}));
vi.mock("@/components/organisms/LooseSellTab", () => ({
  LooseSellTab: () => <div data-testid="loose-tab" />,
}));
vi.mock("@/components/hooks/useVendorCart", () => ({ useVendorCart: vi.fn() }));
vi.mock("@/components/hooks/useVendorCheckout", () => ({ useVendorCheckout: vi.fn() }));
vi.mock("@/components/hooks/useCashSession", () => ({ useGetCurrentCashSession: vi.fn() }));
vi.mock("@/components/molecules/VendorOrderPanel", () => ({
  VendorOrderPanel: () => <div data-testid="order-panel" />,
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { UnifiedPos } from "@/views/UnifiedPos";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { toast } from "react-toastify";

function renderPos(cart: Record<string, unknown> = {}) {
  const base = {
    items: [], totalAmount: 0, itemCount: 0,
    addToCart: vi.fn(), updateQuantity: vi.fn(), removeFromCart: vi.fn(), clearCart: vi.fn(),
    ...cart,
  };
  vi.mocked(useVendorCart).mockReturnValue(base as never);
  vi.mocked(useVendorCheckout).mockReturnValue({
    confirming: false, savingOrder: false, handleConfirmSale: vi.fn(), handleSaveOrder: vi.fn(),
  } as never);
  vi.mocked(useGetCurrentCashSession).mockReturnValue({
    session: { id: "cs-1", status: "OPEN" }, loading: false, error: null, refetch: vi.fn(),
  } as never);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <UnifiedPos branchId="branch-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return base;
}

const scanCode = (code: string) => {
  for (const ch of code.split("")) {
    if (/[A-Z]/.test(ch)) fireEvent.keyDown(window, { key: "Shift" });
    fireEvent.keyDown(window, { key: ch });
  }
  fireEvent.keyDown(window, { key: "Enter" });
};

const mockFetch = (product: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ status: 200, ok: true, json: () => Promise.resolve({ isScale: false, product }) }),
  );

const blister = { id: "b", name: "Blister", factor: 10, price: 150, wholesalePrice: null, sortOrder: 0 };
const pending = { id: "x", name: "Pack", factor: 0, price: 50, wholesalePrice: null, sortOrder: 1 };
const withPresentations = {
  _id: "p1", id: "p1", name: "Ibuprofeno", price: 900, code: "BLST00001", quantity: 25,
  category: { name: "FARMACIA" }, hasPresentations: true, presentations: [blister, pending],
};

describe("UnifiedPos scan with presentations", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("opens the picker instead of the loose-blister modal", async () => {
    mockFetch(withPresentations);
    renderPos();
    scanCode("BLST00001");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /vender pastillas sueltas/i })).toBeNull();
  });

  it("adds the chosen presentation to the cart", async () => {
    mockFetch(withPresentations);
    const cart = renderPos();
    scanCode("BLST00001");
    fireEvent.click(await screen.findByRole("option", { name: /Blister/ }));
    expect(cart.addToCart).toHaveBeenCalledTimes(1);
    const args = cart.addToCart.mock.calls[0];
    expect(args[0]).toMatchObject({ _id: "p1", name: "Ibuprofeno" });
    expect(args[1]).toBe(1);
    expect(args[3]).toBe(25);
    expect(args[4]).toBe("BOLSA_CERRADA");
    expect(args[10]).toMatchObject({ id: "b" });
  });

  it("blocks when the cart already holds the base-unit stock", async () => {
    mockFetch({ ...withPresentations, quantity: 20 });
    const cart = renderPos({
      items: [{ productId: "p1", saleMode: "BOLSA_CERRADA", presentationId: "b", quantity: 2 }],
    });
    scanCode("BLST00001");
    fireEvent.click(await screen.findByRole("option", { name: /Blister/ }));
    expect(cart.addToCart).not.toHaveBeenCalled();
    expect(cart.updateQuantity).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("increments an existing presentation line", async () => {
    mockFetch(withPresentations);
    const cart = renderPos({
      items: [{ productId: "p1", saleMode: "BOLSA_CERRADA", presentationId: "b", quantity: 1 }],
    });
    scanCode("BLST00001");
    fireEvent.click(await screen.findByRole("option", { name: /Blister/ }));
    expect(cart.updateQuantity).toHaveBeenCalledWith("p1", 2, "BOLSA_CERRADA", undefined, "b");
  });

  it("adds several presentations at once from the picker quantity", async () => {
    mockFetch(withPresentations);
    const cart = renderPos();
    scanCode("BLST00001");
    fireEvent.change(await screen.findByLabelText("Cantidad"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("option", { name: /Blister/ }));
    expect(cart.addToCart).toHaveBeenCalledTimes(1);
    expect(cart.addToCart.mock.calls[0][1]).toBe(2);
  });

  it("adds the picked quantity on top of an existing line", async () => {
    mockFetch({ ...withPresentations, quantity: 50 });
    const cart = renderPos({
      items: [{ productId: "p1", saleMode: "BOLSA_CERRADA", presentationId: "b", quantity: 1 }],
    });
    scanCode("BLST00001");
    fireEvent.change(await screen.findByLabelText("Cantidad"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("option", { name: /Blister/ }));
    expect(cart.updateQuantity).toHaveBeenCalledWith("p1", 3, "BOLSA_CERRADA", undefined, "b");
  });

  it("blocks when the picked quantity exceeds the base-unit stock", async () => {
    mockFetch({ ...withPresentations, quantity: 25 });
    const cart = renderPos({
      items: [{ productId: "p1", saleMode: "BOLSA_CERRADA", presentationId: "b", quantity: 1 }],
    });
    scanCode("BLST00001");
    fireEvent.change(await screen.findByLabelText("Cantidad"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("option", { name: /Blister/ }));
    expect(cart.updateQuantity).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("scanning the same product again while the picker is open adds 1 to the quantity", async () => {
    mockFetch({ ...withPresentations, quantity: 100 });
    const cart = renderPos();
    scanCode("BLST00001");
    expect(await screen.findByLabelText("Cantidad")).toHaveValue("1");
    scanCode("BLST00001");
    await waitFor(() => expect(screen.getByLabelText("Cantidad")).toHaveValue("2"));
    scanCode("BLST00001");
    await waitFor(() => expect(screen.getByLabelText("Cantidad")).toHaveValue("3"));
    fireEvent.click(screen.getByRole("option", { name: /Blister/ }));
    expect(cart.addToCart).toHaveBeenCalledTimes(1);
    expect(cart.addToCart.mock.calls[0][1]).toBe(3);
  });

  it("FARMACIA without presentations keeps the loose-blister modal", async () => {
    mockFetch({ ...withPresentations, hasPresentations: false, presentations: [] });
    renderPos();
    scanCode("BLST00001");
    expect(await screen.findByRole("switch", { name: /vender pastillas sueltas/i })).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/productService", () => ({
  getProductStock: vi.fn(),
}));

vi.mock("@/services/onboardingService", () => ({
  getMe: vi.fn().mockResolvedValue({ sellsWholesale: false }),
}));

vi.mock("@/components/hooks/useCashSession", () => ({
  useGetCurrentCashSession: vi.fn(() => ({ session: { id: "cs1" }, loading: false })),
}));

vi.mock("@/components/hooks/useTicketCompany", () => ({
  useTicketCompany: vi.fn(() => ({ businessName: "Mi Pet Shop", taxId: "30-1" })),
}));

const confirmSale = vi.fn();
vi.mock("@/components/hooks/useVendorCheckout", () => ({
  useVendorCheckout: vi.fn(() => ({
    confirming: false,
    savingOrder: false,
    handleConfirmSale: confirmSale,
    handleSaveOrder: vi.fn(),
    pendingTicket: null,
    dismissTicket: vi.fn(),
  })),
}));

// The real sheet needs payments/cash hooks; a stub that exposes what the panel
// passes is enough to prove the wiring (open state, items, cash session).
vi.mock("@/components/molecules/VendorCartSheet", () => ({
  VendorCartSheet: (props: {
    open: boolean;
    cart: { items: { name: string; quantity: number }[]; totalAmount: number };
    cashSessionId?: string;
    handlers: { confirmSale: () => void };
  }) =>
    props.open ? (
      <div data-testid="cart-sheet">
        {props.cart.items.map((i) => `${i.name}×${i.quantity}`).join(",")}|{props.cart.totalAmount}|
        {props.cashSessionId}
        <button onClick={() => props.handlers.confirmSale()}>cobrar</button>
      </div>
    ) : null,
}));

import { ScannerSellPanel } from "@/components/organisms/ScannerSellPanel";
import type { ScanSellResult, ScannedProduct } from "@/components/hooks/useScannerSell";
import { getProductStock } from "@/services/productService";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { useTicketCompany } from "@/components/hooks/useTicketCompany";

const mockGetProductStock = vi.mocked(getProductStock);

type Handler = (p: ScannedProduct) => Promise<ScanSellResult>;

function renderPanel(branchId: string | null = "b1") {
  let handler: Handler | null = null;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ScannerSellPanel
        branchId={branchId}
        registerScanHandler={(h) => {
          handler = h;
        }}
      />
    </QueryClientProvider>,
  );
  return {
    scan: async (p: Partial<ScannedProduct> = {}) => {
      let out: ScanSellResult | undefined;
      await act(async () => {
        out = await handler!({ id: "p1", name: "Collar de Cuero", price: 1500, quantity: 0, ...p });
      });
      return out!;
    },
  };
}

describe("ScannerSellPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetProductStock.mockResolvedValue({
      productId: "p1",
      branches: [{ branchId: "b1", branchName: "Sucursal 1", quantity: 5, isHeadquarters: false, canEdit: true }],
    });
  });

  it("shows nothing (no bar, no feedback) while the cart is empty", () => {
    renderPanel();
    expect(screen.queryByText(/Agregado:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver pedido/i })).not.toBeInTheDocument();
  });

  it("shows the 'Agregado' feedback and the bottom bar after a scan", async () => {
    const { scan } = renderPanel();
    const out = await scan();
    expect(out).toMatchObject({ ok: true, quantity: 1 });
    expect(mockGetProductStock).toHaveBeenCalledWith("p1");
    expect(screen.getByText("Agregado: Collar de Cuero ×1")).toBeInTheDocument();
    const bar = screen.getByRole("button", { name: /ver pedido/i });
    expect(bar).toHaveTextContent("1");
    expect(bar).toHaveTextContent("1.500");
  });

  it("increments on a repeated scan and through the + / − buttons", async () => {
    const { scan } = renderPanel();
    await scan();
    await scan();
    expect(screen.getByText("Agregado: Collar de Cuero ×2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sumar uno" }));
    expect(screen.getByText("Agregado: Collar de Cuero ×3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restar uno" }));
    fireEvent.click(screen.getByRole("button", { name: "Restar uno" }));
    expect(screen.getByText("Agregado: Collar de Cuero ×1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ver pedido/i })).toHaveTextContent("1.500");
  });

  it("removes the feedback when − takes the quantity to zero", async () => {
    const { scan } = renderPanel();
    await scan();
    fireEvent.click(screen.getByRole("button", { name: "Restar uno" }));
    expect(screen.queryByText(/Agregado:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver pedido/i })).not.toBeInTheDocument();
  });

  it("returns the block reason without touching the cart when there is no stock", async () => {
    mockGetProductStock.mockResolvedValue({
      productId: "p1",
      branches: [{ branchId: "b1", branchName: "Sucursal 1", quantity: 0, isHeadquarters: false, canEdit: true }],
    });
    const { scan } = renderPanel();
    const out = await scan();
    expect(out).toMatchObject({ ok: false, reason: "no-stock" });
    expect(screen.queryByText(/Agregado:/)).not.toBeInTheDocument();
  });

  it("treats a branch missing from the stock response as a stock lookup failure", async () => {
    mockGetProductStock.mockResolvedValue({ productId: "p1", branches: [] });
    const { scan } = renderPanel();
    expect(await scan()).toMatchObject({ ok: false, reason: "stock-unavailable" });
  });

  it("opens the existing cart sheet from the bottom bar with items, total and cash session", async () => {
    const { scan } = renderPanel();
    await scan();
    await scan();
    expect(screen.queryByTestId("cart-sheet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ver pedido/i }));
    expect(screen.getByTestId("cart-sheet")).toHaveTextContent("Collar de Cuero×2|3000|cs1");

    fireEvent.click(screen.getByText("cobrar"));
    expect(confirmSale).toHaveBeenCalled();
  });

  it("passes the ticket company header (from useTicketCompany) to the checkout", async () => {
    const { scan } = renderPanel("b1");
    await scan();
    expect(vi.mocked(useTicketCompany)).toHaveBeenCalledWith("b1");
    expect(vi.mocked(useVendorCheckout)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ticketCompany: expect.objectContaining({ businessName: "Mi Pet Shop", taxId: "30-1" }),
      }),
    );
  });

  it("wires checkout and the cash session to the scanner's branch", async () => {
    const { scan } = renderPanel("b1");
    await scan();
    expect(vi.mocked(useGetCurrentCashSession)).toHaveBeenCalledWith("b1");
    expect(vi.mocked(useVendorCheckout)).toHaveBeenLastCalledWith(
      expect.objectContaining({ branchId: "b1" }),
    );
  });
});

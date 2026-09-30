import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/services/productService", () => ({ getProductStock: vi.fn() }));
vi.mock("@/services/onboardingService", () => ({
  getMe: vi.fn().mockResolvedValue({ sellsWholesale: false }),
}));
vi.mock("@/components/hooks/useCashSession", () => ({
  useGetCurrentCashSession: vi.fn(() => ({ session: { id: "cs1" }, loading: false })),
}));
vi.mock("@/components/molecules/VendorCartSheet", () => ({ VendorCartSheet: () => null }));

const dismissTicket = vi.fn();
let pendingTicket: unknown = null;
vi.mock("@/components/hooks/useVendorCheckout", () => ({
  useVendorCheckout: () => ({
    confirming: false,
    savingOrder: false,
    handleConfirmSale: vi.fn(),
    handleSaveOrder: vi.fn(),
    pendingTicket,
    dismissTicket,
  }),
}));

const print = vi.fn();
const choose = vi.fn();
const reset = vi.fn();
let printState: { phase: string; message: string; printers?: unknown[] } = { phase: "idle", message: "" };
vi.mock("@/components/hooks/useTicketPrint", () => ({
  useTicketPrint: vi.fn(() => ({ state: printState, print, choose, reset })),
}));

import { ScannerSellPanel } from "@/components/organisms/ScannerSellPanel";
import { useTicketPrint } from "@/components/hooks/useTicketPrint";
import { buildSaleTicket } from "@/utils/saleTicket";

const ticket = buildSaleTicket({
  issuedAt: "2026-09-24T15:30:00",
  businessName: "Mi Pet Shop",
  items: [{ name: "Collar", price: 1500, quantity: 1 }],
});

function renderPanel(branchId: string | null = "b1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ScannerSellPanel branchId={branchId} registerScanHandler={() => {}} />
    </QueryClientProvider>,
  );
}

describe("ScannerSellPanel — imprimir ticket tras cobrar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingTicket = ticket;
    printState = { phase: "idle", message: "" };
  });

  it("sin venta cobrada no muestra nada de impresión", () => {
    pendingTicket = null;
    renderPanel();
    expect(screen.queryByRole("button", { name: /imprimir ticket/i })).not.toBeInTheDocument();
  });

  it("tras cobrar ofrece un botón grande 'Imprimir ticket' que imprime con la sucursal del scanner", () => {
    renderPanel("b1");
    expect(screen.getByText(/venta cobrada/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /imprimir ticket/i });
    expect(btn.className).toMatch(/h-14/);
    fireEvent.click(btn);
    expect(print).toHaveBeenCalledWith(ticket);
    expect(useTicketPrint).toHaveBeenCalledWith("b1");
  });

  it("'No imprimir' descarta el ticket", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /no imprimir/i }));
    expect(dismissTicket).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });

  it("mientras imprime muestra 'Imprimiendo…' y bloquea el botón", () => {
    printState = { phase: "pending", message: "Imprimiendo…" };
    renderPanel();
    expect(screen.getByText("Imprimiendo…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /imprimir ticket/i })).not.toBeInTheDocument();
  });

  it("impreso: confirma y 'Listo' cierra", () => {
    printState = { phase: "printed", message: "Ticket impreso" };
    renderPanel();
    expect(screen.getByText("Ticket impreso")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /listo/i }));
    expect(dismissTicket).toHaveBeenCalled();
  });

  it("venció / error: muestra el mensaje y permite reintentar", () => {
    printState = { phase: "expired", message: "El ticket venció" };
    renderPanel();
    expect(screen.getByText("El ticket venció")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(print).toHaveBeenCalledWith(ticket);
  });

  it("varias impresoras: elige con un toque", () => {
    printState = {
      phase: "choosing",
      message: "¿En qué impresora?",
      printers: [
        { id: "p1", name: "Caja", branchId: "b1", agentOnline: true },
        { id: "p2", name: "Depósito", branchId: "b1", agentOnline: false },
      ],
    };
    renderPanel();
    expect(screen.getByText("¿En qué impresora?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /caja/i }));
    expect(choose).toHaveBeenCalledWith("p1");
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(choose).toHaveBeenCalledWith(null);
  });
});

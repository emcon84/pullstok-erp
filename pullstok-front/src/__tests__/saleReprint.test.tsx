import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const print = vi.fn();
const choose = vi.fn();
const reset = vi.fn();
const printInBrowser = vi.fn();
let printState: { phase: string; message: string; printers?: unknown[] } = { phase: "idle", message: "" };
vi.mock("@/components/hooks/useTicketPrint", () => ({
  useTicketPrint: vi.fn(() => ({ state: printState, print, choose, reset, printInBrowser })),
}));
vi.mock("@/components/hooks/useTicketCompany", () => ({
  useTicketCompany: vi.fn(() => ({ businessName: "Mi Pet Shop", taxId: "30-1" })),
}));

import { SaleReprintDialog } from "@/components/molecules/SaleReprintDialog";
import { DocumentCard } from "@/components/molecules/DocumentCard";
import { useTicketPrint } from "@/components/hooks/useTicketPrint";
import type { Sale } from "@/models/salesModel";

const SALE: Sale = {
  id: "s1",
  branchId: "b9",
  saleDate: "2026-09-24T15:30:00.000Z",
  totalAmount: 1500,
  items: [{ name: "Collar", quantity: 1, price: 1500, category: "Accesorios", saleMode: "BOLSA_CERRADA", productId: "p1" }],
  payments: [{ method: "EFECTIVO", amount: 1500 }],
};

describe("SaleReprintDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    printState = { phase: "idle", message: "" };
  });

  it("no renderiza nada sin venta", () => {
    render(<SaleReprintDialog sale={null} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /imprimir ticket/i })).not.toBeInTheDocument();
  });

  it("imprime la reimpresión de la venta con la sucursal de la venta y el encabezado de empresa", () => {
    render(<SaleReprintDialog sale={SALE} onClose={() => {}} />);
    expect(useTicketPrint).toHaveBeenCalledWith("b9");
    fireEvent.click(screen.getByRole("button", { name: /imprimir ticket/i }));
    expect(print).toHaveBeenCalledTimes(1);
    const ticket = print.mock.calls[0][0];
    expect(ticket).toMatchObject({
      reprint: true,
      businessName: "Mi Pet Shop",
      issuedAt: SALE.saleDate,
      total: 1500,
    });
    expect(ticket.lines[0].label).toBe("Collar");
  });

  it("muestra el estado de impresión del hook (Imprimiendo…)", () => {
    printState = { phase: "sending", message: "Imprimiendo…" };
    render(<SaleReprintDialog sale={SALE} onClose={() => {}} />);
    expect(screen.getByText("Imprimiendo…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^imprimir ticket$/i })).not.toBeInTheDocument();
  });

  it("al cerrar resetea el estado de impresión y avisa", () => {
    const onClose = vi.fn();
    render(<SaleReprintDialog sale={SALE} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(reset).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("DocumentCard — botón Reimprimir ticket", () => {
  const card = (onReprint?: () => void) =>
    render(<DocumentCard label="Venta" title="t" items={[]} total={0} onReprint={onReprint} />);

  it("aparece con aria-label y dispara onReprint", () => {
    const onReprint = vi.fn();
    card(onReprint);
    fireEvent.click(screen.getByRole("button", { name: "Reimprimir ticket" }));
    expect(onReprint).toHaveBeenCalled();
  });

  it("sin onReprint no se muestra", () => {
    card();
    expect(screen.queryByRole("button", { name: "Reimprimir ticket" })).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/hooks/useSales", () => ({
  useGetSales: vi.fn(),
}));
vi.mock("@/components/hooks/useBudget", () => ({
  useGetBudgets: vi.fn(),
}));
vi.mock("@/components/hooks/useOrder", () => ({
  useOrders: vi.fn(),
}));
vi.mock("@/components/hooks/useReceipt", () => ({
  useGetReceipts: vi.fn(),
}));
vi.mock("@/components/molecules/StatsChart", () => ({
  StatsChart: () => <div data-testid="stats-chart" />,
}));
vi.mock("@/components/molecules/ExportButtons", () => ({
  ExportButtons: () => <div data-testid="export-buttons" />,
}));
vi.mock("@/components/atoms/loader", () => ({
  Loader: () => <div data-testid="loader" />,
}));

import { Statistics } from "@/views/Statistics";
import { useGetSales } from "@/components/hooks/useSales";
import { useGetBudgets } from "@/components/hooks/useBudget";
import { useOrders } from "@/components/hooks/useOrder";
import { useGetReceipts } from "@/components/hooks/useReceipt";

const mockUseGetSales = vi.mocked(useGetSales);
const mockUseGetBudgets = vi.mocked(useGetBudgets);
const mockUseOrders = vi.mocked(useOrders);
const mockUseGetReceipts = vi.mocked(useGetReceipts);

// Dos ventas en días LOCALES distintos, "hoy" (mockeado con fake timers más
// abajo) no coincide con ninguna, para forzar a elegir el día explícitamente.
const saleDay20 = { _id: "s1", saleDate: "2026-09-20T10:00:00", totalAmount: 100, payments: [] };
const saleDay21 = { _id: "s2", saleDate: "2026-09-21T10:00:00", totalAmount: 200, payments: [] };

function renderSalesStats() {
  render(<Statistics type="sales" onBack={vi.fn()} />);
}

describe("Statistics — selector de día (pestaña Diario)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0)); // "hoy" = 25/sep/2026, no coincide con las ventas mock
    mockUseGetSales.mockReturnValue({ sales: [saleDay20, saleDay21], loading: false, error: null } as never);
    mockUseGetBudgets.mockReturnValue({ budgets: [], loading: false, error: null } as never);
    mockUseOrders.mockReturnValue({ orders: [], loading: false, error: null } as never);
    mockUseGetReceipts.mockReturnValue({ receipts: [], loading: false, error: null } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("el input de fecha NO aparece en semanal/mensual/anual (default: mensual)", () => {
    renderSalesStats();
    expect(screen.queryByLabelText("Elegir día")).not.toBeInTheDocument();
  });

  it("el input de fecha aparece solo al elegir 'Diario'", () => {
    renderSalesStats();

    fireEvent.click(screen.getByText("Diario"));
    expect(screen.getByLabelText("Elegir día")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Semanal"));
    expect(screen.queryByLabelText("Elegir día")).not.toBeInTheDocument();
  });

  it("cambiar el día recalcula el total/cantidad mostrando solo esa fecha", () => {
    renderSalesStats();
    fireEvent.click(screen.getByText("Diario"));

    const input = screen.getByLabelText("Elegir día") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "2026-09-20" } });
    expect(screen.getByTestId("stats-count").textContent).toBe("1");
    expect(screen.getByTestId("stats-total").textContent).toContain("100");

    fireEvent.change(input, { target: { value: "2026-09-21" } });
    expect(screen.getByTestId("stats-count").textContent).toBe("1");
    expect(screen.getByTestId("stats-total").textContent).toContain("200");
  });

  it("al volver a Diario tras cambiar de pestaña, el día vuelve a 'hoy' (no queda uno lejano)", () => {
    renderSalesStats();
    fireEvent.click(screen.getByText("Diario"));
    const input = screen.getByLabelText("Elegir día") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-09-20" } });
    expect(input.value).toBe("2026-09-20");

    fireEvent.click(screen.getByText("Mensual"));
    fireEvent.click(screen.getByText("Diario"));

    const inputAgain = screen.getByLabelText("Elegir día") as HTMLInputElement;
    expect(inputAgain.value).toBe("2026-09-25"); // "hoy" mockeado
  });
});

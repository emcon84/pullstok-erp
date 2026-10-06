import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

vi.mock("@/components/hooks/useSales", () => ({ useGetSales: vi.fn() }));
vi.mock("@/components/hooks/useBudget", () => ({ useGetBudgets: vi.fn() }));
vi.mock("@/components/hooks/useOrder", () => ({ useOrders: vi.fn() }));
vi.mock("@/components/hooks/useReceipt", () => ({ useGetReceipts: vi.fn() }));
vi.mock("@/components/hooks/useCustomerAccount", () => ({ useAccountCollections: vi.fn() }));
vi.mock("@/components/molecules/StatsChart", () => ({
  StatsChart: () => <div data-testid="stats-chart" />,
}));
vi.mock("@/components/molecules/ExportButtons", () => ({
  ExportButtons: () => <div data-testid="export-buttons" />,
}));
vi.mock("@/components/atoms/loader", () => ({
  Loader: () => <div data-testid="loader" />,
}));
vi.mock("@/components/molecules/RankedBarChart", () => ({
  RankedBarChart: () => <div data-testid="ranked" />,
}));

import { Statistics } from "@/views/Statistics";
import { useGetSales } from "@/components/hooks/useSales";
import { useGetBudgets } from "@/components/hooks/useBudget";
import { useOrders } from "@/components/hooks/useOrder";
import { useGetReceipts } from "@/components/hooks/useReceipt";
import { useAccountCollections } from "@/components/hooks/useCustomerAccount";

const mockCollections = vi.mocked(useAccountCollections);

const sale = {
  _id: "s1",
  saleDate: "2026-09-25T10:00:00",
  totalAmount: 1000,
  payments: [{ method: "TARJETA_DEBITO", amount: 1000 }],
};

const collectionsData = {
  total: 800,
  count: 3,
  byMethod: [
    { method: "EFECTIVO", count: 2, amount: 500 },
    { method: "TRANSFERENCIA", count: 1, amount: 300 },
  ],
};

const setCollections = (collections: typeof collectionsData | null) =>
  mockCollections.mockReturnValue({ collections, loading: false, error: null } as never);

const cardOf = (title: string) =>
  screen.getByText(title).closest("div.border-b")!.parentElement as HTMLElement;

describe("Statistics — cobros de cuenta corriente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0));
    vi.mocked(useGetSales).mockReturnValue({ sales: [sale], loading: false, error: null } as never);
    vi.mocked(useGetBudgets).mockReturnValue({ budgets: [], loading: false, error: null } as never);
    vi.mocked(useOrders).mockReturnValue({ orders: [], loading: false, error: null } as never);
    vi.mocked(useGetReceipts).mockReturnValue({ receipts: [], loading: false, error: null } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the section with per-method rows and a total for sales", () => {
    setCollections(collectionsData);
    render(<Statistics type="sales" onBack={vi.fn()} />);

    expect(screen.getByText("plata cobrada a clientes con deuda")).toBeInTheDocument();
    const card = cardOf("Cobros de cuenta corriente");
    expect(within(card).getByText("Efectivo")).toBeInTheDocument();
    expect(within(card).getByText("Transferencia")).toBeInTheDocument();
    const footerRow = within(card).getByText("Total").closest("tr")!;
    expect(within(footerRow).getByText("3")).toBeInTheDocument();
    expect(footerRow.textContent).toContain("800");
    expect(within(card).getByText("62.5%")).toBeInTheDocument();
  });

  it("renders the collections card right after the 'Ventas por medio de pago' card", () => {
    setCollections(collectionsData);
    render(<Statistics type="sales" onBack={vi.fn()} />);
    expect(cardOf("Ventas por medio de pago").nextElementSibling).toBe(
      cardOf("Cobros de cuenta corriente"),
    );
  });

  it("hides the section when there are no collections", () => {
    setCollections({ total: 0, count: 0, byMethod: [] });
    render(<Statistics type="sales" onBack={vi.fn()} />);
    expect(screen.queryByText("Cobros de cuenta corriente")).not.toBeInTheDocument();
  });

  it("hides the section while there is no data yet", () => {
    setCollections(null);
    render(<Statistics type="sales" onBack={vi.fn()} />);
    expect(screen.queryByText("Cobros de cuenta corriente")).not.toBeInTheDocument();
  });

  it.each(["budgets", "orders", "receipts"] as const)("hides the section for %s", (type) => {
    setCollections(collectionsData);
    render(<Statistics type={type} onBack={vi.fn()} />);
    expect(screen.queryByText("Cobros de cuenta corriente")).not.toBeInTheDocument();
    expect(mockCollections.mock.calls.every((c) => c[2] === false)).toBe(true);
  });

  it("does not merge collections into the 'Ventas por medio de pago' total", () => {
    setCollections(collectionsData);
    render(<Statistics type="sales" onBack={vi.fn()} />);
    const salesCard = cardOf("Ventas por medio de pago");
    const footerRow = within(salesCard).getByText("Total").closest("tr")!;
    expect(footerRow.textContent).toContain("1.000");
    expect(footerRow.textContent).not.toContain("1.800");
    expect(within(salesCard).queryByText("Efectivo")).not.toBeInTheDocument();
  });

  it("queries the same range as the period filter with an exclusive end (daily)", () => {
    setCollections(collectionsData);
    render(<Statistics type="sales" onBack={vi.fn()} />);
    fireEvent.click(screen.getByText("Diario"));
    const [from, to, enabled] = mockCollections.mock.calls.at(-1)!;
    expect(enabled).toBe(true);
    expect(from).toEqual(new Date(2026, 8, 25, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 8, 26, 0, 0, 0, 0));
  });
});

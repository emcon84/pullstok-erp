import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/components/hooks/useSales", () => ({ useGetSales: vi.fn() }));
vi.mock("@/components/hooks/useBudget", () => ({ useGetBudgets: vi.fn() }));
vi.mock("@/components/hooks/useOrder", () => ({ useOrders: vi.fn() }));
vi.mock("@/components/hooks/useReceipt", () => ({ useGetReceipts: vi.fn() }));
vi.mock("@/components/molecules/StatsChart", () => ({
  StatsChart: () => <div data-testid="stats-chart" />,
}));
vi.mock("@/components/molecules/ExportButtons", () => ({
  ExportButtons: () => <div data-testid="export-buttons" />,
}));
vi.mock("@/components/atoms/loader", () => ({
  Loader: () => <div data-testid="loader" />,
}));
// Stub: recharts no se puede maquetar en jsdom; se verifica el cableado de datos.
vi.mock("@/components/molecules/RankedBarChart", () => ({
  RankedBarChart: ({
    title,
    data,
    note,
  }: {
    title: string;
    data: { label: string; amount: number }[];
    note?: string;
  }) => (
    <section data-testid={`ranked-${title}`}>
      <h3>{title}</h3>
      {note && <p>{note}</p>}
      <ul>
        {data.map((r) => (
          <li key={r.label}>{`${r.label}|${r.amount}`}</li>
        ))}
      </ul>
    </section>
  ),
}));

import { Statistics } from "@/views/Statistics";
import { useGetSales } from "@/components/hooks/useSales";
import { useGetBudgets } from "@/components/hooks/useBudget";
import { useOrders } from "@/components/hooks/useOrder";
import { useGetReceipts } from "@/components/hooks/useReceipt";

const item = (name: string, category: string, quantity: number, price: number) => ({
  name,
  category,
  quantity,
  price,
  productId: `id-${name}`,
});

// 20/sep y 21/sep (día local); "hoy" = 25/sep.
const saleDay20 = {
  _id: "s1",
  saleDate: "2026-09-20T10:00:00",
  totalAmount: 400,
  items: [item("Alimento X", "Perros", 2, 100), item("Juguete", "Accesorios", 1, 200)],
};
const saleDay21 = {
  _id: "s2",
  saleDate: "2026-09-21T10:00:00",
  totalAmount: 3000,
  items: [item("Alimento X", "Perros", 3, 1000)],
};

describe("Statistics — rankings de ventas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0));
    vi.mocked(useGetSales).mockReturnValue({ sales: [saleDay20, saleDay21], loading: false, error: null } as never);
    vi.mocked(useGetBudgets).mockReturnValue({ budgets: [{ _id: "b", createdAt: "2026-09-20T10:00:00", totalAmount: 5 }], loading: false, error: null } as never);
    vi.mocked(useOrders).mockReturnValue({ orders: [], loading: false, error: null } as never);
    vi.mocked(useGetReceipts).mockReturnValue({ receipts: [], loading: false, error: null } as never);
  });
  afterEach(() => vi.useRealTimers());

  it("en ventas muestra 'Ventas por categoría' y 'Productos más vendidos' del período", () => {
    render(<Statistics type="sales" onBack={vi.fn()} />);
    const cats = screen.getByTestId("ranked-Ventas por categoría");
    expect(within(cats).getByText("Perros|3200")).toBeInTheDocument();
    expect(within(cats).getByText("Accesorios|200")).toBeInTheDocument();
    const prods = screen.getByTestId("ranked-Productos más vendidos");
    expect(within(prods).getByText("Alimento X|3200")).toBeInTheDocument();
    expect(within(prods).getByText("Juguete|200")).toBeInTheDocument();
  });

  it("aclara que los montos son antes de descuentos/recargos", () => {
    render(<Statistics type="sales" onBack={vi.fn()} />);
    expect(
      within(screen.getByTestId("ranked-Ventas por categoría")).getByText(/antes de descuentos/i),
    ).toBeInTheDocument();
  });

  it("respeta el período elegido (Diario filtra por el día)", () => {
    render(<Statistics type="sales" onBack={vi.fn()} />);
    fireEvent.click(screen.getByText("Diario"));
    fireEvent.change(screen.getByLabelText("Elegir día"), { target: { value: "2026-09-20" } });
    const cats = screen.getByTestId("ranked-Ventas por categoría");
    expect(within(cats).getByText("Perros|200")).toBeInTheDocument();
    expect(within(cats).queryByText("Perros|3200")).not.toBeInTheDocument();
  });

  it("no aparecen en presupuestos", () => {
    render(<Statistics type="budgets" onBack={vi.fn()} />);
    expect(screen.queryByTestId("ranked-Ventas por categoría")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ranked-Productos más vendidos")).not.toBeInTheDocument();
  });
});

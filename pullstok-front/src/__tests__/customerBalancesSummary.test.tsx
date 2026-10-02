import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomerBalancesSummary } from "../components/molecules/CustomerBalancesSummary";

const balances = [
  { customerId: "c-1", name: "Ana Gómez", balance: 1500 },
  { customerId: "c-2", name: "Beto Ruiz", balance: 500 },
  { customerId: "c-3", name: "Carla Paz", balance: -200 },
  { customerId: "c-4", name: "", balance: 250 },
];

describe("CustomerBalancesSummary", () => {
  it("shows a loading state", () => {
    render(<CustomerBalancesSummary balances={[]} loading onSelectCustomer={vi.fn()} />);
    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
  });

  it("shows an empty-friendly message when nobody owes", () => {
    render(
      <CustomerBalancesSummary
        balances={[{ customerId: "c-3", name: "Carla", balance: -10 }]}
        loading={false}
        onSelectCustomer={vi.fn()}
      />,
    );
    expect(screen.getByText("Nadie debe plata")).toBeInTheDocument();
  });

  it("renders totals, counts and net", () => {
    render(<CustomerBalancesSummary balances={balances} loading={false} onSelectCustomer={vi.fn()} />);
    expect(screen.getByText("Cuenta corriente — resumen")).toBeInTheDocument();
    expect(screen.getByTestId("total-owed")).toHaveTextContent("$2.250,00");
    expect(screen.getByTestId("total-credit")).toHaveTextContent("$200,00");
    expect(screen.getByTestId("net")).toHaveTextContent("$2.050,00");
    expect(screen.getByText(/3 clientes con deuda/)).toBeInTheDocument();
    expect(screen.getByText(/1 cliente con saldo a favor/)).toBeInTheDocument();
  });

  it("lists top debtors with display-name fallback and opens the account on click", () => {
    const onSelect = vi.fn();
    render(<CustomerBalancesSummary balances={balances} loading={false} onSelectCustomer={onSelect} />);
    const rows = screen.getAllByTestId("top-debtor");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Ana Gómez");
    expect(rows[2]).toHaveTextContent("Sin nombre");
    fireEvent.click(rows[1]);
    expect(onSelect).toHaveBeenCalledWith({ customerId: "c-2", name: "Beto Ruiz" });
  });
});

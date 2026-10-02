import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../services/customerService", () => ({
  fetchPadron: vi.fn(),
  getCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
}));

vi.mock("../components/hooks/useCustomer", () => ({
  useCustomers: vi.fn(),
  useCreateCustomer: vi.fn(),
  useUpdateCustomer: vi.fn(),
  useDeleteCustomer: vi.fn(),
}));

vi.mock("../components/hooks/useCustomerAccount", () => ({
  useCustomerBalances: vi.fn(),
  useCustomerAccount: vi.fn(),
  useRegisterAccountPayment: vi.fn(),
  useGetAccountStatementLink: vi.fn(),
  useCreateHistoricalCharge: vi.fn(),
  useUpdateAccountMovement: vi.fn(),
  useDeleteAccountMovement: vi.fn(),
}));
vi.mock("../services/customerAccountService", () => ({
  unlockBalancesView: vi.fn(),
  getBalancesSummary: vi.fn(),
}));
vi.mock("../components/hooks/useCashSession", () => ({
  useGetCurrentCashSession: vi.fn(),
}));

import { Customers } from "../views/Customers";
import {
  useCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from "../components/hooks/useCustomer";
import {
  useCustomerBalances,
  useCustomerAccount,
  useRegisterAccountPayment,
  useGetAccountStatementLink,
  useCreateHistoricalCharge,
  useUpdateAccountMovement,
  useDeleteAccountMovement,
} from "../components/hooks/useCustomerAccount";
import { useGetCurrentCashSession } from "../components/hooks/useCashSession";
import { unlockBalancesView, getBalancesSummary } from "../services/customerAccountService";

const renderCustomers = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Customers />
    </QueryClientProvider>,
  );

describe("Customers — balances summary panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(useCustomers).mockReturnValue({
      customers: [
        { id: "c-1", name: "Ana Gómez", email: "ana@x.com", phone: "1" },
        { id: "c-2", name: "Beto Ruiz", email: "beto@x.com", phone: "2" },
        { id: "c-3", name: "Carla Paz", email: "carla@x.com", phone: "3" },
      ],
      loadingCustomer: false,
      errorCustomer: null,
    } as never);
    vi.mocked(useCreateCustomer).mockReturnValue({ submitCustomer: vi.fn(), loadingCustomer: false } as never);
    vi.mocked(useUpdateCustomer).mockReturnValue({ updateCustomer: vi.fn(), loadingUpdate: false } as never);
    vi.mocked(useDeleteCustomer).mockReturnValue({ deleteCustomer: vi.fn(), loading: false } as never);
    vi.mocked(useCustomerBalances).mockReturnValue({
      balances: [
        { customerId: "c-1", name: "Ana Gómez", balance: 1500.5 },
        { customerId: "c-2", name: "Beto Ruiz", balance: -200 },
      ],
      loading: false,
      error: null,
    } as never);
    vi.mocked(useCustomerAccount).mockReturnValue({
      account: {
        customer: { id: "c-1", name: "Ana Gómez" },
        balance: 1500.5,
        movements: [
          { id: "m-1", type: "CHARGE", amount: 1500.5, saleId: "sale-abcdef123456", createdAt: "2026-09-27T12:00:00.000Z" },
        ],
      },
      loading: false,
      error: null,
    } as never);
    vi.mocked(useRegisterAccountPayment).mockReturnValue({ registerPayment: vi.fn(), loading: false } as never);
    vi.mocked(useGetAccountStatementLink).mockReturnValue({ getStatementLink: vi.fn(), loading: false } as never);
    vi.mocked(useCreateHistoricalCharge).mockReturnValue({ createCharge: vi.fn(), loading: false } as never);
    vi.mocked(useUpdateAccountMovement).mockReturnValue({ updateMovement: vi.fn(), loading: false } as never);
    vi.mocked(useDeleteAccountMovement).mockReturnValue({ deleteMovement: vi.fn(), loading: false } as never);
    vi.mocked(unlockBalancesView).mockResolvedValue({ token: "bt", expiresInSec: 900 });
    vi.mocked(getBalancesSummary).mockResolvedValue({
      totalOwed: 1500.5,
      totalCredit: 200,
      net: 1300.5,
      debtorCount: 1,
      creditorCount: 1,
      topDebtors: [{ customerId: "c-1", name: "Ana Gómez", balance: 1500.5, share: 1 }],
    });
    vi.mocked(useGetCurrentCashSession).mockReturnValue({ session: null, loading: false, error: null, refetch: vi.fn() } as never);
  });

  it("shows the summary panel to ADMIN, masked until unlocked", () => {
    localStorage.setItem("user", JSON.stringify({ role: "ADMIN" }));
    renderCustomers();
    expect(screen.getByText("Cuenta corriente — resumen")).toBeInTheDocument();
    expect(screen.getByTestId("total-owed")).toHaveTextContent("••••••");
    expect(getBalancesSummary).not.toHaveBeenCalled();
  });

  it("shows the summary panel to MANAGEMENT", () => {
    localStorage.setItem("user", JSON.stringify({ role: "MANAGEMENT" }));
    renderCustomers();
    expect(screen.getByText("Cuenta corriente — resumen")).toBeInTheDocument();
  });

  it("hides the summary panel from VENDEDOR", () => {
    localStorage.setItem("user", JSON.stringify({ role: "VENDEDOR" }));
    renderCustomers();
    expect(screen.queryByText("Cuenta corriente — resumen")).not.toBeInTheDocument();
  });

  it("opens the customer account drawer when clicking a top debtor after unlocking", async () => {
    localStorage.setItem("user", JSON.stringify({ role: "ADMIN" }));
    renderCustomers();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar saldos" }));
    fireEvent.change(await screen.findByLabelText("Contraseña"), { target: { value: "pw" } });
    fireEvent.submit(screen.getByLabelText("Contraseña").closest("form")!);
    fireEvent.click(await screen.findByTestId("top-debtor"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

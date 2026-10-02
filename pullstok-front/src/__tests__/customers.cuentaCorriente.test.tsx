import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

const renderCustomers = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Customers />
    </QueryClientProvider>,
  );

const cardOf = (name: string) => screen.getByText(name).closest("[data-slot=card]") as HTMLElement;

describe("Customers — cuenta corriente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(useGetCurrentCashSession).mockReturnValue({ session: null, loading: false, error: null, refetch: vi.fn() } as never);
  });

  it("shows the debt of a debtor customer as 'Debe'", () => {
    renderCustomers();
    const card = within(cardOf("Ana Gómez"));
    expect(card.getByText("Saldo")).toBeInTheDocument();
    expect(card.getByText("Debe $1.500,50")).toBeInTheDocument();
  });

  it("shows a credit balance as 'A favor'", () => {
    renderCustomers();
    expect(within(cardOf("Beto Ruiz")).getByText("A favor $200,00")).toBeInTheDocument();
  });

  it("shows a dash for customers without balance", () => {
    renderCustomers();
    expect(within(cardOf("Carla Paz")).getByText("—")).toBeInTheDocument();
  });

  it("opens the account drawer of the chosen customer", () => {
    renderCustomers();
    expect(screen.queryByText("Cuenta corriente — Ana Gómez")).not.toBeInTheDocument();

    fireEvent.click(within(cardOf("Ana Gómez")).getByRole("button", { name: "Cuenta corriente" }));

    expect(useCustomerAccount).toHaveBeenCalledWith("c-1");
    expect(screen.getByText("Cuenta corriente — Ana Gómez")).toBeInTheDocument();
    expect(screen.getByText("#sale-abc")).toBeInTheDocument();
    // The dialog gets the customer's phone straight from the caller (no refetch).
    expect(screen.getByRole("button", { name: /enviar por whatsapp/i })).not.toBeDisabled();
  });
});

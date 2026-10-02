import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../services/customerAccountService", () => ({
  unlockBalancesView: vi.fn(),
  getBalancesSummary: vi.fn(),
}));

import { CustomerBalancesSummary } from "../components/molecules/CustomerBalancesSummary";
import { unlockBalancesView, getBalancesSummary } from "../services/customerAccountService";

const SUMMARY = {
  totalOwed: 2250,
  totalCredit: 200,
  net: 2050,
  debtorCount: 3,
  creditorCount: 1,
  topDebtors: [
    { customerId: "c-1", name: "Ana Gómez", balance: 1500, share: 0.67 },
    { customerId: "c-2", name: "Beto Ruiz", balance: 500, share: 0.22 },
    { customerId: "c-4", name: "", balance: 250, share: 0.11 },
  ],
};

const renderPanel = (onSelect = vi.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CustomerBalancesSummary onSelectCustomer={onSelect} />
    </QueryClientProvider>,
  );

const unlock = async (password = "pw") => {
  fireEvent.click(screen.getByRole("button", { name: "Mostrar saldos" }));
  fireEvent.change(await screen.findByLabelText("Contraseña"), { target: { value: password } });
  fireEvent.submit(screen.getByLabelText("Contraseña").closest("form")!);
};

describe("CustomerBalancesSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(unlockBalancesView).mockResolvedValue({ token: "tok-bal-xyz", expiresInSec: 900 });
    vi.mocked(getBalancesSummary).mockResolvedValue(SUMMARY);
  });
  afterEach(() => vi.useRealTimers());

  it("is locked by default: masked values, no request, no names", () => {
    renderPanel();
    expect(screen.getByText("Cuenta corriente — resumen")).toBeInTheDocument();
    expect(screen.getByTestId("total-owed")).toHaveTextContent("••••••");
    expect(screen.getByTestId("total-credit")).toHaveTextContent("••••••");
    expect(screen.getByTestId("net")).toHaveTextContent("••••••");
    expect(screen.getByRole("button", { name: "Mostrar saldos" })).toBeInTheDocument();
    expect(getBalancesSummary).not.toHaveBeenCalled();
    expect(screen.queryByTestId("top-debtor")).not.toBeInTheDocument();
  });

  it("unlocks with the password: shows numbers, open-eye button, clickable top debtors", async () => {
    const onSelect = vi.fn();
    renderPanel(onSelect);
    await unlock("secret");
    expect(await screen.findByText("$2.250,00")).toBeInTheDocument();
    expect(unlockBalancesView).toHaveBeenCalledWith("secret");
    expect(getBalancesSummary).toHaveBeenCalledWith("tok-bal-xyz");
    expect(screen.getByTestId("total-credit")).toHaveTextContent("$200,00");
    expect(screen.getByTestId("net")).toHaveTextContent("$2.050,00");
    expect(screen.getByText(/3 clientes con deuda/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar saldos" })).toBeInTheDocument();
    const rows = screen.getAllByTestId("top-debtor");
    expect(rows[2]).toHaveTextContent("Sin nombre");
    fireEvent.click(rows[1]);
    expect(onSelect).toHaveBeenCalledWith({ customerId: "c-2", name: "Beto Ruiz" });
  });

  it("hides again, discards the token and asks for the password next time", async () => {
    renderPanel();
    await unlock();
    fireEvent.click(await screen.findByRole("button", { name: "Ocultar saldos" }));
    expect(screen.getByTestId("total-owed")).toHaveTextContent("••••••");
    expect(screen.queryByTestId("top-debtor")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar saldos" }));
    expect(await screen.findByLabelText("Contraseña")).toBeInTheDocument();
  });

  it("never persists the token in web storage", async () => {
    renderPanel();
    await unlock();
    await screen.findByRole("button", { name: "Ocultar saldos" });
    expect(JSON.stringify({ ...localStorage })).not.toContain("tok-bal-xyz");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("tok-bal-xyz");
  });

  it("shows the server message on a wrong password and stays locked", async () => {
    vi.mocked(unlockBalancesView).mockRejectedValue(new Error("Contraseña incorrecta"));
    renderPanel();
    await unlock("bad");
    expect(await screen.findByRole("alert")).toHaveTextContent("Contraseña incorrecta");
    expect(screen.getByTestId("total-owed")).toHaveTextContent("••••••");
    expect(getBalancesSummary).not.toHaveBeenCalled();
  });

  it("shows the not-configured message from the server", async () => {
    vi.mocked(unlockBalancesView).mockRejectedValue(
      new Error("La contraseña de saldos no está configurada en el servidor"),
    );
    renderPanel();
    await unlock();
    expect(await screen.findByRole("alert")).toHaveTextContent("no está configurada");
  });

  it("opens a password input (type=password) with autofocus", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar saldos" }));
    const input = await screen.findByLabelText("Contraseña");
    expect(input).toHaveAttribute("type", "password");
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("re-locks when the server answers BALANCES_LOCKED", async () => {
    vi.mocked(getBalancesSummary).mockRejectedValue(
      Object.assign(new Error("Los saldos están bloqueados"), { code: "BALANCES_LOCKED" }),
    );
    renderPanel();
    await unlock();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Mostrar saldos" })).toBeInTheDocument(),
    );
    expect(screen.getByTestId("total-owed")).toHaveTextContent("••••••");
  });

  it("re-locks when the token expires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(unlockBalancesView).mockResolvedValue({ token: "tok-bal-xyz", expiresInSec: 60 });
    renderPanel();
    await unlock();
    await screen.findByRole("button", { name: "Ocultar saldos" });
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByRole("button", { name: "Mostrar saldos" })).toBeInTheDocument();
    expect(screen.getByTestId("total-owed")).toHaveTextContent("••••••");
  });

  it("shows a friendly message when nobody owes", async () => {
    vi.mocked(getBalancesSummary).mockResolvedValue({
      ...SUMMARY,
      totalOwed: 0,
      debtorCount: 0,
      topDebtors: [],
    });
    renderPanel();
    await unlock();
    expect(await screen.findByText("Nadie debe plata")).toBeInTheDocument();
  });
});

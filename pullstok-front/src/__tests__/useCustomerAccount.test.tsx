import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../services/customerAccountService", () => ({
  getCustomerBalances: vi.fn(),
  getCustomerAccount: vi.fn(),
  registerAccountPayment: vi.fn(),
  getAccountStatementLink: vi.fn(),
}));

import {
  useCustomerBalances,
  useCustomerAccount,
  useRegisterAccountPayment,
  useGetAccountStatementLink,
} from "../components/hooks/useCustomerAccount";
import {
  getCustomerBalances,
  getCustomerAccount,
  registerAccountPayment,
  getAccountStatementLink,
} from "../services/customerAccountService";

const mockBalances = vi.mocked(getCustomerBalances);
const mockAccount = vi.mocked(getCustomerAccount);
const mockRegister = vi.mocked(registerAccountPayment);
const mockStatementLink = vi.mocked(getAccountStatementLink);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const account = (balance: number) => ({
  customer: { id: "c-1", name: "Ana" },
  balance,
  movements: [],
});

describe("useCustomerAccount hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBalances.mockResolvedValue([{ customerId: "c-1", name: "Ana", balance: 1000 }]);
    mockAccount.mockResolvedValue(account(1000));
  });

  it("useCustomerBalances loads the balances", async () => {
    const { result } = renderHook(() => useCustomerBalances(), { wrapper });
    await waitFor(() => expect(result.current.balances).toHaveLength(1));
    expect(result.current.balances[0].balance).toBe(1000);
  });

  it("useCustomerAccount is disabled without a customer id", () => {
    renderHook(() => useCustomerAccount(""), { wrapper });
    expect(mockAccount).not.toHaveBeenCalled();
  });

  it("useCustomerAccount loads the statement of the customer", async () => {
    const { result } = renderHook(() => useCustomerAccount("c-1"), { wrapper });
    await waitFor(() => expect(result.current.account?.balance).toBe(1000));
    expect(mockAccount).toHaveBeenCalledWith("c-1");
  });

  it("registering a cobranza refreshes the account and the balances", async () => {
    mockRegister.mockResolvedValue({ movement: { id: "m-1" } as never, balance: 400 });
    const { result } = renderHook(
      () => ({
        balances: useCustomerBalances(),
        account: useCustomerAccount("c-1"),
        register: useRegisterAccountPayment(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.account.account?.balance).toBe(1000));
    expect(mockBalances).toHaveBeenCalledTimes(1);
    expect(mockAccount).toHaveBeenCalledTimes(1);

    mockAccount.mockResolvedValue(account(400));
    mockBalances.mockResolvedValue([{ customerId: "c-1", name: "Ana", balance: 400 }]);

    await act(async () => {
      await result.current.register.registerPaymentAsync({
        customerId: "c-1",
        input: { amount: 600, method: "TRANSFERENCIA" },
      });
    });

    expect(mockRegister).toHaveBeenCalledWith("c-1", { amount: 600, method: "TRANSFERENCIA" });
    await waitFor(() => expect(result.current.account.account?.balance).toBe(400));
    await waitFor(() => expect(result.current.balances.balances[0].balance).toBe(400));
  });

  // wa.me fallback (T4): builds+uploads the PDF, returns its url — no phone
  // required, no Kapso call (Kapso is sandboxed and rejects unsolicited sends).
  it("useGetAccountStatementLink resolves with the PDF url and filename", async () => {
    mockStatementLink.mockResolvedValue({
      url: "https://r2.example.com/estado-cuenta-ana.pdf",
      filename: "estado-cuenta-Ana.pdf",
    });
    const { result } = renderHook(() => useGetAccountStatementLink(), { wrapper });

    let link: { url: string; filename: string } | undefined;
    await act(async () => {
      link = await result.current.getStatementLinkAsync("c-1");
    });

    expect(mockStatementLink).toHaveBeenCalledWith("c-1");
    expect(link).toEqual({
      url: "https://r2.example.com/estado-cuenta-ana.pdf",
      filename: "estado-cuenta-Ana.pdf",
    });
  });
});

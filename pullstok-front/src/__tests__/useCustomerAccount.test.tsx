import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../services/customerAccountService", () => ({
  getCustomerBalances: vi.fn(),
  getCustomerAccount: vi.fn(),
  getAccountCollections: vi.fn(),
  registerAccountPayment: vi.fn(),
  getAccountStatementLink: vi.fn(),
  createHistoricalCharge: vi.fn(),
  updateAccountMovement: vi.fn(),
  deleteAccountMovement: vi.fn(),
}));

import {
  useCustomerBalances,
  useCustomerAccount,
  useAccountCollections,
  useRegisterAccountPayment,
  useGetAccountStatementLink,
  useCreateHistoricalCharge,
  useUpdateAccountMovement,
  useDeleteAccountMovement,
} from "../components/hooks/useCustomerAccount";
import {
  getCustomerBalances,
  getCustomerAccount,
  getAccountCollections,
  registerAccountPayment,
  getAccountStatementLink,
  createHistoricalCharge,
  updateAccountMovement,
  deleteAccountMovement,
} from "../services/customerAccountService";

const mockBalances = vi.mocked(getCustomerBalances);
const mockAccount = vi.mocked(getCustomerAccount);
const mockCollections = vi.mocked(getAccountCollections);
const mockRegister = vi.mocked(registerAccountPayment);
const mockStatementLink = vi.mocked(getAccountStatementLink);
const mockCreateCharge = vi.mocked(createHistoricalCharge);
const mockUpdateMovement = vi.mocked(updateAccountMovement);
const mockDeleteMovement = vi.mocked(deleteAccountMovement);

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

  it("creating a historical charge refreshes the account and the balances (not the cash register)", async () => {
    mockCreateCharge.mockResolvedValue({ movement: { id: "m-9" } as never, balance: 1700 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const localWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateHistoricalCharge(), { wrapper: localWrapper });

    await act(async () => {
      await result.current.createChargeAsync({ customerId: "c-1", input: { amount: 700 } });
    });

    expect(mockCreateCharge).toHaveBeenCalledWith("c-1", { amount: 700 });
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["customer-account", "c-1"]);
    expect(keys).toContainEqual(["customer-balances"]);
    expect(keys).not.toContainEqual(["cash-sessions"]);
  });

  const spiedWrapper = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const keys = () => invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    return { Wrapper, keys };
  };

  it("updating a movement refreshes the account, the balances and the cash register", async () => {
    mockUpdateMovement.mockResolvedValue({ movement: { id: "m-1" } as never, balance: 300 });
    const { Wrapper, keys } = spiedWrapper();
    const { result } = renderHook(() => useUpdateAccountMovement(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateMovementAsync({
        customerId: "c-1",
        movementId: "m-1",
        input: { amount: 200 },
      });
    });

    expect(mockUpdateMovement).toHaveBeenCalledWith("c-1", "m-1", { amount: 200 });
    expect(keys()).toContainEqual(["customer-account", "c-1"]);
    expect(keys()).toContainEqual(["customer-balances"]);
    expect(keys()).toContainEqual(["cash-sessions"]);
  });

  it("deleting a movement refreshes the account, the balances and the cash register", async () => {
    mockDeleteMovement.mockResolvedValue({ deletedId: "m-1", balance: 900 });
    const { Wrapper, keys } = spiedWrapper();
    const { result } = renderHook(() => useDeleteAccountMovement(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.deleteMovementAsync({ customerId: "c-1", movementId: "m-1" });
    });

    expect(mockDeleteMovement).toHaveBeenCalledWith("c-1", "m-1");
    expect(keys()).toContainEqual(["customer-account", "c-1"]);
    expect(keys()).toContainEqual(["customer-balances"]);
    expect(keys()).toContainEqual(["cash-sessions"]);
  });
});

describe("useAccountCollections", () => {
  const from = new Date("2026-10-01T03:00:00.000Z");
  const to = new Date("2026-10-02T03:00:00.000Z");
  const payload = { total: 300, count: 2, byMethod: [{ method: "EFECTIVO", count: 2, amount: 300 }] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCollections.mockResolvedValue(payload);
  });

  it("loads the collections for the range", async () => {
    const { result } = renderHook(() => useAccountCollections(from, to, true), { wrapper });
    await waitFor(() => expect(result.current.collections).toEqual(payload));
    expect(mockCollections).toHaveBeenCalledWith(from, to);
  });

  it("does not fetch when disabled", () => {
    const { result } = renderHook(() => useAccountCollections(from, to, false), { wrapper });
    expect(mockCollections).not.toHaveBeenCalled();
    expect(result.current.collections).toBeNull();
  });

  it("keeps the previous data while the range changes", async () => {
    let resolveNext: (v: typeof payload) => void = () => {};
    const { result, rerender } = renderHook(
      ({ f, t }: { f: Date; t: Date }) => useAccountCollections(f, t, true),
      { wrapper, initialProps: { f: from, t: to } },
    );
    await waitFor(() => expect(result.current.collections).toEqual(payload));

    mockCollections.mockReturnValueOnce(new Promise((r) => { resolveNext = r; }));
    rerender({ f: new Date("2026-10-02T03:00:00.000Z"), t: new Date("2026-10-03T03:00:00.000Z") });
    expect(result.current.collections).toEqual(payload);
    await act(async () => {
      resolveNext({ total: 0, count: 0, byMethod: [] });
    });
    await waitFor(() => expect(result.current.collections?.count).toBe(0));
  });
});

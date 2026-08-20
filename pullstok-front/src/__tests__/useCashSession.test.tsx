import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Hoisted mock — the service layer is replaced so the hook test stays focused
// on query/mutation wiring (key, fetch-on-mount, propagation).
vi.mock("../services/cashSessionServices", () => ({
  getCurrentCashSession: vi.fn(),
  getCashSessions: vi.fn(),
  getCashSession: vi.fn(),
  openCashSession: vi.fn(),
  closeCashSession: vi.fn(),
}));

import {
  useGetCurrentCashSession,
  useGetCashSessions,
  useGetCashSession,
  useOpenCashSession,
  useCloseCashSession,
} from "../components/hooks/useCashSession";
import {
  getCurrentCashSession,
  getCashSessions,
  getCashSession,
  openCashSession,
  closeCashSession,
} from "../services/cashSessionServices";

const getCurrentMock = vi.mocked(getCurrentCashSession);
const getSessionsMock = vi.mocked(getCashSessions);
const getOneMock = vi.mocked(getCashSession);
const openMock = vi.mocked(openCashSession);
const closeMock = vi.mocked(closeCashSession);

function renderWithClient(ui: React.ReactElement, client?: QueryClient) {
  const c =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  return {
    ...render(<QueryClientProvider client={c}>{ui}</QueryClientProvider>),
    client: c,
  };
}

function CurrentHarness({ branchId }: { branchId?: string }) {
  const { session, loading, error } = useGetCurrentCashSession(branchId);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="session-id">{session?.id ?? "none"}</span>
      <span data-testid="error">{error ? error.message : "no-error"}</span>
    </div>
  );
}

function ListHarness({ status }: { status?: string }) {
  const { sessions, loading } = useGetCashSessions({ status });
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="count">{sessions.length}</span>
    </div>
  );
}

describe("useCashSession — wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useGetCurrentCashSession fetches the OPEN session on mount", async () => {
    getCurrentMock.mockResolvedValue({
      id: "cs-1",
      status: "OPEN",
      openingAmount: 5000,
      payments: [],
    } as any);

    renderWithClient(<CurrentHarness />);

    await waitFor(() =>
      expect(screen.getByTestId("session-id")).toHaveTextContent("cs-1"),
    );
    expect(getCurrentMock).toHaveBeenCalledWith(undefined);
  });

  it("useGetCurrentCashSession includes branchId in query key and propagates it", async () => {
    getCurrentMock.mockResolvedValue(null);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderWithClient(<CurrentHarness branchId="br-norte" />, client);

    await waitFor(() =>
      expect(screen.getByTestId("session-id")).toHaveTextContent("none"),
    );
    expect(getCurrentMock).toHaveBeenCalledWith("br-norte");

    const cache = client.getQueryCache();
    const queries = cache.findAll({
      queryKey: ["cash-sessions", "current", "br-norte"],
    });
    expect(queries).toHaveLength(1);
  });

  it("useGetCurrentCashSession returns null session when backend has none", async () => {
    getCurrentMock.mockResolvedValue(null);
    renderWithClient(<CurrentHarness />);
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("session-id")).toHaveTextContent("none");
  });

  it("useGetCashSessions fetches the list and maps to items", async () => {
    getSessionsMock.mockResolvedValue([{ id: "cs-1" }, { id: "cs-2" }] as any);

    renderWithClient(<ListHarness />);

    await waitFor(() =>
      expect(screen.getByTestId("count")).toHaveTextContent("2"),
    );
    expect(getSessionsMock).toHaveBeenCalledWith({ status: undefined });
  });

  it("useGetCashSession fetches a single session by id", async () => {
    getOneMock.mockResolvedValue({ id: "cs-9", status: "CLOSED" } as any);
    let session: any = null;
    function Harness() {
      session = useGetCashSession("cs-9").session;
      return <div data-testid="done">done</div>;
    }
    renderWithClient(<Harness />);
    await waitFor(() => expect(getOneMock).toHaveBeenCalledWith("cs-9"));
    await waitFor(() => expect(session).not.toBeNull());
  });

  it("useOpenCashSession mutates openCashSession", async () => {
    openMock.mockResolvedValue({ id: "cs-new" } as any);
    let called = false;
    function Harness() {
      const { openCashSession, loading } = useOpenCashSession();
      if (!called) {
        called = true;
        openCashSession({ openingAmount: 1000, branchId: "b1" });
      }
      return <span data-testid="loading">{String(loading)}</span>;
    }
    renderWithClient(<Harness />);
    await waitFor(() =>
      expect(openMock).toHaveBeenCalledWith({
        openingAmount: 1000,
        branchId: "b1",
      }),
    );
  });

  it("useCloseCashSession mutates closeCashSession with id + payload", async () => {
    closeMock.mockResolvedValue({
      expectedAmount: 100,
      closingAmount: 100,
      difference: 0,
    } as any);
    let called = false;
    function Harness() {
      const { closeCashSession, loading } = useCloseCashSession();
      if (!called) {
        called = true;
        closeCashSession({
          id: "cs-1",
          payload: { closingByMethod: { EFECTIVO: 100 }, closingAmount: 100 },
        });
      }
      return <span data-testid="loading">{String(loading)}</span>;
    }
    renderWithClient(<Harness />);
    await waitFor(() =>
      expect(closeMock).toHaveBeenCalledWith("cs-1", {
        closingByMethod: { EFECTIVO: 100 },
        closingAmount: 100,
      }),
    );
  });
});

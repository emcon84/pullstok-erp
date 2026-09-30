import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/utils/printTicketAgent", () => ({ printSaleTicketViaAgent: vi.fn() }));
vi.mock("@/utils/relayPrint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/relayPrint")>()),
  watchPrintJob: vi.fn(),
}));

import { printSaleTicketViaAgent } from "@/utils/printTicketAgent";
import { JOB_MESSAGES, watchPrintJob } from "@/utils/relayPrint";
import { useTicketPrint } from "@/components/hooks/useTicketPrint";
import { buildSaleTicket } from "@/utils/saleTicket";

const ticket = buildSaleTicket({
  issuedAt: "2026-09-24T15:30:00",
  businessName: "Mi Pet Shop",
  items: [{ name: "Royal Canin 15kg", price: 8000, quantity: 2 }],
});
const p1 = { id: "p1", name: "Caja", branchId: "b1", agentOnline: true };
const p2 = { id: "p2", name: "Depósito", branchId: "b1", agentOnline: true };

type Opts = NonNullable<Parameters<typeof printSaleTicketViaAgent>[1]>;

describe("useTicketPrint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts idle", () => {
    const { result } = renderHook(() => useTicketPrint("b1"));
    expect(result.current.state.phase).toBe("idle");
  });

  it("relay: shows 'Imprimiendo…' while polling and 'Impreso' at the end", async () => {
    let resolveWatch!: (v: { phase: "printed"; message: string }) => void;
    vi.mocked(watchPrintJob).mockImplementation(
      (_id, onUpdate) =>
        new Promise((r) => {
          onUpdate({ phase: "pending", message: JOB_MESSAGES.pending });
          resolveWatch = (v) => {
            onUpdate(v);
            r(v);
          };
        }),
    );
    vi.mocked(printSaleTicketViaAgent).mockImplementation(async (_t, o?: Opts) => {
      o?.onRelayJob?.("job-1", p1);
      return "relay";
    });
    const { result } = renderHook(() => useTicketPrint("b1"));

    await act(async () => {
      await result.current.print(ticket);
    });
    expect(printSaleTicketViaAgent).toHaveBeenCalledWith(ticket, expect.objectContaining({ branchId: "b1" }));
    expect(result.current.state).toMatchObject({ phase: "pending", message: "Imprimiendo…" });

    await act(async () => resolveWatch({ phase: "printed", message: JOB_MESSAGES.printed }));
    expect(result.current.state).toMatchObject({ phase: "printed", message: "Ticket impreso" });
  });

  it("expired and error are surfaced with clear messages", async () => {
    vi.mocked(printSaleTicketViaAgent).mockImplementation(async (_t, o?: Opts) => {
      o?.onRelayJob?.("job-1", p1);
      return "relay";
    });
    vi.mocked(watchPrintJob).mockImplementation(async (_id, onUpdate) => {
      const r = { phase: "expired" as const, message: JOB_MESSAGES.expired };
      onUpdate(r);
      return r;
    });
    const { result } = renderHook(() => useTicketPrint("b1"));
    await act(async () => {
      await result.current.print(ticket);
    });
    await waitFor(() => expect(result.current.state.phase).toBe("expired"));
    expect(result.current.state.message).toMatch(/15 minutos/);
  });

  it("agent result: shows printed", async () => {
    vi.mocked(printSaleTicketViaAgent).mockResolvedValue("agent");
    const { result } = renderHook(() => useTicketPrint("b1"));
    await act(async () => {
      await result.current.print(ticket);
    });
    expect(result.current.state.phase).toBe("printed");
  });

  it("panel fallback: tells the user the print panel was opened", async () => {
    vi.mocked(printSaleTicketViaAgent).mockResolvedValue("panel");
    const { result } = renderHook(() => useTicketPrint("b1"));
    await act(async () => {
      await result.current.print(ticket);
    });
    expect(result.current.state.phase).toBe("panel");
    expect(result.current.state.message).toMatch(/panel de impresión/i);
  });

  it("several printers: exposes the choices, waits, then continues with the chosen one", async () => {
    let chosen: string | null = "unset";
    vi.mocked(printSaleTicketViaAgent).mockImplementation(async (_t, o?: Opts) => {
      chosen = (await o!.chooseRelayPrinter!([p1, p2])) as string | null;
      return chosen ? "relay" : "cancelled";
    });
    vi.mocked(watchPrintJob).mockResolvedValue({ phase: "printed", message: JOB_MESSAGES.printed });
    const { result } = renderHook(() => useTicketPrint("b1"));

    let done!: Promise<void>;
    await act(async () => {
      done = result.current.print(ticket);
    });
    await waitFor(() => expect(result.current.state.phase).toBe("choosing"));
    expect(result.current.state.printers).toEqual([p1, p2]);

    await act(async () => {
      result.current.choose("p2");
      await done;
    });
    expect(chosen).toBe("p2");
  });

  it("cancelling the choice returns to idle", async () => {
    vi.mocked(printSaleTicketViaAgent).mockImplementation(async (_t, o?: Opts) => {
      const c = await o!.chooseRelayPrinter!([p1, p2]);
      return c ? "relay" : "cancelled";
    });
    const { result } = renderHook(() => useTicketPrint("b1"));
    let done!: Promise<void>;
    await act(async () => {
      done = result.current.print(ticket);
    });
    await waitFor(() => expect(result.current.state.phase).toBe("choosing"));
    await act(async () => {
      result.current.choose(null);
      await done;
    });
    expect(result.current.state.phase).toBe("idle");
  });

  it("ignores a second print while one is in flight", async () => {
    let release!: () => void;
    vi.mocked(printSaleTicketViaAgent).mockImplementation(
      () => new Promise((r) => (release = () => r("agent"))),
    );
    const { result } = renderHook(() => useTicketPrint("b1"));
    let first!: Promise<void>;
    await act(async () => {
      first = result.current.print(ticket);
    });
    await act(async () => {
      await result.current.print(ticket);
    });
    expect(printSaleTicketViaAgent).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await first;
    });
  });

  it("reset returns to idle and aborts the job watch", async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(printSaleTicketViaAgent).mockImplementation(async (_t, o?: Opts) => {
      o?.onRelayJob?.("job-1", p1);
      return "relay";
    });
    vi.mocked(watchPrintJob).mockImplementation((_id, _u, opts) => {
      signal = opts?.signal;
      return new Promise(() => {});
    });
    const { result } = renderHook(() => useTicketPrint("b1"));
    await act(async () => {
      await result.current.print(ticket);
    });
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe("idle");
    expect(signal?.aborted).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/printerService", () => ({
  getActivePrinters: vi.fn(),
  createPrintJob: vi.fn(),
  getPrintJob: vi.fn(),
}));
vi.mock("@/utils/ticketLogo", () => ({ prepareTicketLogoBitmap: vi.fn() }));

import { createPrintJob, getActivePrinters, getPrintJob } from "@/services/printerService";
import { prepareTicketLogoBitmap } from "@/utils/ticketLogo";
import { buildSaleTicket } from "@/utils/saleTicket";
import {
  JOB_MESSAGES,
  encodeTicketPayload,
  getRememberedPrinterId,
  fetchRelayPrinters,
  loadRelayPrinters,
  rememberPrinter,
  resolveRelayTarget,
  sendTicketToRelay,
  watchPrintJob,
  _resetRelayPrintersCache,
  type RelayPrinter,
} from "@/utils/relayPrint";

const ticket = () =>
  buildSaleTicket({
    issuedAt: "2026-09-24T15:30:00",
    businessName: "Mi Pet Shop",
    items: [{ name: "Royal Canin 15kg", price: 8000, quantity: 2 }],
    payments: [{ method: "EFECTIVO", amount: 16000 }],
  });

const pr = (id: string, branchId: string | null = null, agentOnline = true): RelayPrinter => ({
  id,
  name: `Impresora ${id}`,
  branchId,
  agentOnline,
});

describe("encodeTicketPayload / sendTicketToRelay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prepareTicketLogoBitmap).mockResolvedValue(null as never);
  });

  it("encodes the ESC/POS ticket (init + cut) as base64", async () => {
    const b64 = await encodeTicketPayload(ticket());
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    const arr = Array.from(bytes);
    expect(arr.some((b, i) => b === 0x1d && arr[i + 1] === 0x56)).toBe(true);
  });

  it("prints without logo when the logo fails", async () => {
    vi.mocked(prepareTicketLogoBitmap).mockRejectedValue(new Error("cors"));
    await expect(encodeTicketPayload({ ...ticket(), logoUrl: "https://x/l.png" })).resolves.toEqual(
      expect.any(String),
    );
  });

  it("POSTs the job to the chosen printer and returns its id", async () => {
    vi.mocked(createPrintJob).mockResolvedValue({ id: "j1", status: "PENDING", expiresAt: "x" });
    await expect(sendTicketToRelay(ticket(), "p1")).resolves.toEqual({ id: "j1" });
    expect(createPrintJob).toHaveBeenCalledWith("p1", expect.any(String));
  });
});

describe("remembered printer per branch", () => {
  beforeEach(() => localStorage.clear());

  it("stores one printer per branch", () => {
    rememberPrinter("b1", "p1");
    rememberPrinter("b2", "p2");
    expect(getRememberedPrinterId("b1")).toBe("p1");
    expect(getRememberedPrinterId("b2")).toBe("p2");
    expect(getRememberedPrinterId("b3")).toBeNull();
  });

  it("survives a throwing localStorage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getRememberedPrinterId("b1")).toBeNull();
    spy.mockRestore();
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rememberPrinter("b1", "p1")).not.toThrow();
    set.mockRestore();
  });
});

describe("resolveRelayTarget", () => {
  beforeEach(() => localStorage.clear());

  it("none when the org has no active printers", () => {
    expect(resolveRelayTarget([], "b1")).toEqual({ kind: "none" });
  });

  it("uses the remembered printer of the branch when it is still active", () => {
    rememberPrinter("b1", "p2");
    const r = resolveRelayTarget([pr("p1", "b1"), pr("p2", "b1")], "b1");
    expect(r).toMatchObject({ kind: "printer", printer: { id: "p2" } });
  });

  it("ignores a remembered printer that no longer exists", () => {
    rememberPrinter("b1", "gone");
    const r = resolveRelayTarget([pr("p1", "b1")], "b1");
    expect(r).toMatchObject({ kind: "printer", printer: { id: "p1" } });
  });

  it("defaults to the branch's only printer", () => {
    const r = resolveRelayTarget([pr("p1", "b1"), pr("p2", "b2")], "b1");
    expect(r).toMatchObject({ kind: "printer", printer: { id: "p1" } });
  });

  it("asks to choose among the branch's printers when there are several", () => {
    const r = resolveRelayTarget([pr("p1", "b1"), pr("p2", "b1"), pr("p3", "b2")], "b1");
    expect(r.kind).toBe("choose");
    expect((r as { printers: RelayPrinter[] }).printers.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("falls back to the only active printer of the org when the branch has none", () => {
    const r = resolveRelayTarget([pr("p9", "b2")], "b1");
    expect(r).toMatchObject({ kind: "printer", printer: { id: "p9" } });
  });

  it("asks to choose among all when the branch has none and several exist", () => {
    const r = resolveRelayTarget([pr("p1", "b2"), pr("p2", "b3")], "b1");
    expect(r.kind).toBe("choose");
    expect((r as { printers: RelayPrinter[] }).printers).toHaveLength(2);
  });

  it("works without a branch (single printer / choose)", () => {
    expect(resolveRelayTarget([pr("p1")], null)).toMatchObject({ kind: "printer" });
    expect(resolveRelayTarget([pr("p1"), pr("p2")], null).kind).toBe("choose");
  });
});

describe("loadRelayPrinters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRelayPrintersCache();
  });

  it("returns the list and caches it briefly", async () => {
    vi.mocked(getActivePrinters).mockResolvedValue([pr("p1")]);
    await loadRelayPrinters();
    await loadRelayPrinters();
    expect(getActivePrinters).toHaveBeenCalledTimes(1);
  });

  it("returns [] (never throws) when the request fails, e.g. 403", async () => {
    vi.mocked(getActivePrinters).mockRejectedValue(new Error("403"));
    await expect(loadRelayPrinters()).resolves.toEqual([]);
  });
});

describe("fetchRelayPrinters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRelayPrintersCache();
  });

  it("throws the request error instead of returning []", async () => {
    vi.mocked(getActivePrinters).mockRejectedValue(new Error("Sin permiso"));
    await expect(fetchRelayPrinters()).rejects.toThrow("Sin permiso");
  });

  it("returns an empty list when there are simply no printers", async () => {
    vi.mocked(getActivePrinters).mockResolvedValue([]);
    await expect(fetchRelayPrinters()).resolves.toEqual([]);
  });
});

describe("watchPrintJob", () => {
  const job = (status: string, errorMessage: string | null = null) => ({
    id: "j1",
    printerId: "p1",
    status,
    errorMessage,
  });
  const fast = { intervalMs: 10, sleep: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    fast.sleep.mockResolvedValue(undefined);
  });

  it("reports pending until the agent prints, then printed", async () => {
    vi.mocked(getPrintJob)
      .mockResolvedValueOnce(job("PENDING") as never)
      .mockResolvedValueOnce(job("PENDING") as never)
      .mockResolvedValueOnce(job("PRINTED") as never);
    const seen: string[] = [];
    const res = await watchPrintJob("j1", (u) => seen.push(u.phase), fast);
    expect(res).toEqual({ phase: "printed", message: JOB_MESSAGES.printed });
    expect(seen).toEqual(["pending", "pending", "printed"]);
    expect(fast.sleep).toHaveBeenCalledTimes(2);
  });

  it("reports expired with the 15 minutes message", async () => {
    vi.mocked(getPrintJob).mockResolvedValue(job("EXPIRED") as never);
    const res = await watchPrintJob("j1", () => {}, fast);
    expect(res.phase).toBe("expired");
    expect(res.message).toMatch(/15 minutos/);
  });

  it("reports error with the agent's message", async () => {
    vi.mocked(getPrintJob).mockResolvedValue(job("ERROR", "Sin papel") as never);
    const res = await watchPrintJob("j1", () => {}, fast);
    expect(res.phase).toBe("error");
    expect(res.message).toContain("Sin papel");
  });

  it("keeps polling through transient network errors", async () => {
    vi.mocked(getPrintJob)
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValueOnce(job("PRINTED") as never);
    const res = await watchPrintJob("j1", () => {}, fast);
    expect(res.phase).toBe("printed");
  });

  it("gives up with an error after too many consecutive failures", async () => {
    vi.mocked(getPrintJob).mockRejectedValue(new Error("net"));
    const res = await watchPrintJob("j1", () => {}, { ...fast, maxConsecutiveErrors: 3 });
    expect(res.phase).toBe("error");
    expect(res.message).toMatch(/estado/i);
    expect(getPrintJob).toHaveBeenCalledTimes(3);
  });

  it("treats a job still pending past the deadline as expired", async () => {
    vi.mocked(getPrintJob).mockResolvedValue(job("PENDING") as never);
    let t = 0;
    const res = await watchPrintJob("j1", () => {}, {
      intervalMs: 1000,
      timeoutMs: 3000,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    });
    expect(res.phase).toBe("expired");
  });

  it("stops when aborted", async () => {
    vi.mocked(getPrintJob).mockResolvedValue(job("PENDING") as never);
    const ctrl = new AbortController();
    const p = watchPrintJob("j1", () => ctrl.abort(), { ...fast, signal: ctrl.signal });
    await expect(p).resolves.toMatchObject({ phase: "aborted" });
  });
});

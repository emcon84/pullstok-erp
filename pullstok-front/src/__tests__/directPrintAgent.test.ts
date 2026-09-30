import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_AGENT_URL,
  DirectPrintAgentError,
  getAgentBaseUrl,
  getAgentHealth,
  getAgentPrinters,
  isAgentEnabled,
  pairAgent,
  printAgentTest,
  printBytesViaAgent,
  setAgentBaseUrl,
  setAgentEnabled,
  setAgentPrinter,
} from "@/utils/directPrintAgent";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("directPrintAgent — cliente HTTP", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("usa la URL por defecto y la de localStorage si existe", () => {
    expect(getAgentBaseUrl()).toBe(DEFAULT_AGENT_URL);
    setAgentBaseUrl("http://127.0.0.1:9999/");
    expect(getAgentBaseUrl()).toBe("http://127.0.0.1:9999");
  });

  it("si localStorage lanza, no revienta y usa los defaults", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getAgentBaseUrl()).toBe(DEFAULT_AGENT_URL);
    expect(isAgentEnabled()).toBe(false);
    spy.mockRestore();
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setAgentEnabled(true)).not.toThrow();
    set.mockRestore();
  });

  it("enabled: ausente = false; setAgentEnabled lo prende y apaga", () => {
    expect(isAgentEnabled()).toBe(false);
    setAgentEnabled(true);
    expect(localStorage.getItem("pullstok-print-agent-enabled")).toBe("1");
    expect(isAgentEnabled()).toBe(true);
    setAgentEnabled(false);
    expect(localStorage.getItem("pullstok-print-agent-enabled")).toBeNull();
    expect(isAgentEnabled()).toBe(false);
  });

  it("getAgentHealth: GET /health", async () => {
    const body = { name: "pullstok-print-agent", version: "1.0.0", printer: "OCOM", platform: "win32" };
    fetchMock.mockResolvedValue(json(body));
    await expect(getAgentHealth()).resolves.toEqual(body);
    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_AGENT_URL}/health`);
  });

  it("getAgentPrinters: devuelve la lista", async () => {
    fetchMock.mockResolvedValue(json({ printers: ["A", "B"] }));
    await expect(getAgentPrinters()).resolves.toEqual(["A", "B"]);
  });

  it("setAgentPrinter: PUT /config con {printer}", async () => {
    fetchMock.mockResolvedValue(json({ printer: "A" }));
    await setAgentPrinter("A");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DEFAULT_AGENT_URL}/config`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ printer: "A" });
  });

  it("printBytesViaAgent: POST /print con los bytes crudos octet-stream", async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    const bytes = new Uint8Array([0x1b, 0x40, 0x41]);
    await printBytesViaAgent(bytes);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DEFAULT_AGENT_URL}/print`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/octet-stream");
    expect(init.body).toBe(bytes);
  });

  it("printAgentTest: POST /test", async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await printAgentTest();
    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_AGENT_URL}/test`);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("error HTTP: lanza DirectPrintAgentError con el message del agente y el status", async () => {
    fetchMock.mockResolvedValue(json({ message: "No hay impresora configurada" }, 409));
    const err = await printBytesViaAgent(new Uint8Array([1])).catch((e) => e);
    expect(err).toBeInstanceOf(DirectPrintAgentError);
    expect(err.message).toBe("No hay impresora configurada");
    expect(err.status).toBe(409);
  });

  it("error HTTP sin JSON: mensaje genérico", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 502 }));
    const err = await printAgentTest().catch((e) => e);
    expect(err).toBeInstanceOf(DirectPrintAgentError);
    expect(err.status).toBe(502);
    expect(err.message).toBeTruthy();
  });

  it("agente caído (fetch rechaza): DirectPrintAgentError sin status", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await getAgentHealth().catch((e) => e);
    expect(err).toBeInstanceOf(DirectPrintAgentError);
    expect(err.status).toBeUndefined();
  });

  it("timeout: aborta la request y rechaza (nunca cuelga el POS)", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
        }),
    );
    const p = getAgentHealth().catch((e) => e);
    await vi.advanceTimersByTimeAsync(5000);
    const err = await p;
    expect(err).toBeInstanceOf(DirectPrintAgentError);
    expect(err.message).toMatch(/tiempo|respond/i);
  });
});

describe("directPrintAgent — emparejamiento", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pairAgent: POST /pair con {code} y devuelve el resultado", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, agentId: "a1", name: "Caja" }));
    await expect(pairAgent("ABCDE-12345")).resolves.toEqual({ ok: true, agentId: "a1", name: "Caja" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DEFAULT_AGENT_URL}/pair`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ code: "ABCDE-12345" });
  });

  it("pairAgent: el agente responde error -> DirectPrintAgentError con su mensaje", async () => {
    fetchMock.mockResolvedValue(json({ message: "Código de emparejamiento inválido o vencido" }, 400));
    const err = await pairAgent("bad").catch((e) => e);
    expect(err).toBeInstanceOf(DirectPrintAgentError);
    expect(err.message).toMatch(/inválido/);
  });
});

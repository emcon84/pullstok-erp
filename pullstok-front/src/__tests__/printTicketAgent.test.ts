import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/directPrintAgent", () => ({
  isAgentEnabled: vi.fn(),
  printBytesViaAgent: vi.fn(),
}));
vi.mock("@/utils/saleTicket", async () => {
  const actual = await vi.importActual<typeof import("@/utils/saleTicket")>("@/utils/saleTicket");
  return { ...actual, printSaleTicket: vi.fn() };
});
vi.mock("@/utils/ticketLogo", () => ({ prepareTicketLogoBitmap: vi.fn() }));
vi.mock("@/utils/relayPrint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/relayPrint")>()),
  fetchRelayPrinters: vi.fn(),
  sendTicketToRelay: vi.fn(),
  rememberPrinter: vi.fn(),
}));

import { printSaleTicketViaAgent } from "@/utils/printTicketAgent";
import { isAgentEnabled, printBytesViaAgent } from "@/utils/directPrintAgent";
import { buildSaleTicket, printSaleTicket } from "@/utils/saleTicket";
import { prepareTicketLogoBitmap } from "@/utils/ticketLogo";
import { fetchRelayPrinters, rememberPrinter, sendTicketToRelay } from "@/utils/relayPrint";

const ticket = (over = {}) =>
  buildSaleTicket({
    issuedAt: "2026-09-24T15:30:00",
    businessName: "Mi Pet Shop",
    items: [{ name: "Royal Canin 15kg", price: 8000, quantity: 2 }],
    payments: [{ method: "EFECTIVO", amount: 16000 }],
    ...over,
  });

describe("printSaleTicketViaAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAgentEnabled).mockReturnValue(true);
    vi.mocked(printBytesViaAgent).mockResolvedValue(undefined);
    vi.mocked(prepareTicketLogoBitmap).mockResolvedValue(null as never);
    vi.mocked(fetchRelayPrinters).mockResolvedValue([]);
  });

  it("agente deshabilitado: va directo al panel, sin tocar el agente ni avisar", async () => {
    vi.mocked(isAgentEnabled).mockReturnValue(false);
    const onAgentFailure = vi.fn();
    await expect(printSaleTicketViaAgent(ticket(), { onAgentFailure })).resolves.toBe("panel");
    expect(printBytesViaAgent).not.toHaveBeenCalled();
    expect(printSaleTicket).toHaveBeenCalledTimes(1);
    expect(onAgentFailure).not.toHaveBeenCalled();
  });

  it("agente OK: manda bytes ESC/POS con corte y devuelve 'agent' sin abrir el panel", async () => {
    await expect(printSaleTicketViaAgent(ticket())).resolves.toBe("agent");
    expect(printSaleTicket).not.toHaveBeenCalled();
    const bytes = vi.mocked(printBytesViaAgent).mock.calls[0][0];
    expect(bytes).toBeInstanceOf(Uint8Array);
    // ESC @ (init) al inicio y GS V (corte) presente
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    const arr = Array.from(bytes);
    expect(arr.some((b, i) => b === 0x1d && arr[i + 1] === 0x56)).toBe(true);
  });

  it("logo que falla: imprime igual sin logo", async () => {
    vi.mocked(prepareTicketLogoBitmap).mockRejectedValue(new Error("cors"));
    await expect(
      printSaleTicketViaAgent(ticket({ logoUrl: "https://x/logo.png" })),
    ).resolves.toBe("agent");
    expect(printBytesViaAgent).toHaveBeenCalledTimes(1);
  });

  it("agente falla: cae al panel, avisa por onAgentFailure y devuelve 'panel'", async () => {
    const boom = new Error("No hay impresora configurada");
    vi.mocked(printBytesViaAgent).mockRejectedValue(boom);
    const onAgentFailure = vi.fn();
    await expect(printSaleTicketViaAgent(ticket(), { onAgentFailure })).resolves.toBe("panel");
    expect(onAgentFailure).toHaveBeenCalledWith(boom);
    expect(printSaleTicket).toHaveBeenCalledTimes(1);
  });

  it("onAgentFailure que lanza no impide el panel; si el panel lanza, no propaga", async () => {
    vi.mocked(printBytesViaAgent).mockRejectedValue(new Error("x"));
    vi.mocked(printSaleTicket).mockRejectedValue(new Error("panel"));
    await expect(
      printSaleTicketViaAgent(ticket(), {
        onAgentFailure: () => {
          throw new Error("toast");
        },
      }),
    ).resolves.toBe("panel");
    expect(printSaleTicket).toHaveBeenCalled();
  });
});

describe("printSaleTicketViaAgent — relay por servidor (celular)", () => {
  const p1 = { id: "p1", name: "Caja", branchId: "b1", agentOnline: true };
  const p2 = { id: "p2", name: "Depósito", branchId: "b1", agentOnline: true };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(isAgentEnabled).mockReturnValue(false);
    vi.mocked(prepareTicketLogoBitmap).mockResolvedValue(null as never);
    vi.mocked(fetchRelayPrinters).mockResolvedValue([p1]);
    vi.mocked(sendTicketToRelay).mockResolvedValue({ id: "job-1" });
  });

  it("agente local OK: no consulta ni usa el relay", async () => {
    vi.mocked(isAgentEnabled).mockReturnValue(true);
    vi.mocked(printBytesViaAgent).mockResolvedValue(undefined);
    await expect(printSaleTicketViaAgent(ticket(), { branchId: "b1" })).resolves.toBe("agent");
    expect(fetchRelayPrinters).not.toHaveBeenCalled();
    expect(sendTicketToRelay).not.toHaveBeenCalled();
  });

  it("sin agente local y con una impresora de la sucursal: manda el job al relay", async () => {
    const onRelayJob = vi.fn();
    await expect(printSaleTicketViaAgent(ticket(), { branchId: "b1", onRelayJob })).resolves.toBe("relay");
    expect(sendTicketToRelay).toHaveBeenCalledWith(expect.anything(), "p1");
    expect(onRelayJob).toHaveBeenCalledWith("job-1", p1);
    expect(rememberPrinter).toHaveBeenCalledWith("b1", "p1");
    expect(printSaleTicket).not.toHaveBeenCalled();
  });

  it("el agente local falla: prueba el relay antes del panel y no avisa del panel", async () => {
    vi.mocked(isAgentEnabled).mockReturnValue(true);
    vi.mocked(printBytesViaAgent).mockRejectedValue(new Error("caído"));
    const onAgentFailure = vi.fn();
    await expect(printSaleTicketViaAgent(ticket(), { branchId: "b1", onAgentFailure })).resolves.toBe("relay");
    expect(onAgentFailure).not.toHaveBeenCalled();
    expect(printSaleTicket).not.toHaveBeenCalled();
  });

  it("agente local falla y no hay relay: avisa y cae al panel", async () => {
    vi.mocked(isAgentEnabled).mockReturnValue(true);
    vi.mocked(printBytesViaAgent).mockRejectedValue(new Error("caído"));
    vi.mocked(fetchRelayPrinters).mockResolvedValue([]);
    const onAgentFailure = vi.fn();
    await expect(printSaleTicketViaAgent(ticket(), { branchId: "b1", onAgentFailure })).resolves.toBe("panel");
    expect(onAgentFailure).toHaveBeenCalledTimes(1);
    expect(printSaleTicket).toHaveBeenCalledTimes(1);
  });

  it("sin impresoras activas: panel de Chrome", async () => {
    vi.mocked(fetchRelayPrinters).mockResolvedValue([]);
    await expect(printSaleTicketViaAgent(ticket(), { branchId: "b1" })).resolves.toBe("panel");
    expect(sendTicketToRelay).not.toHaveBeenCalled();
    expect(printSaleTicket).toHaveBeenCalledTimes(1);
  });

  it("varias impresoras sin recordada: pide elegir y recuerda la elegida", async () => {
    vi.mocked(fetchRelayPrinters).mockResolvedValue([p1, p2]);
    const chooseRelayPrinter = vi.fn().mockResolvedValue("p2");
    await expect(printSaleTicketViaAgent(ticket(), { branchId: "b1", chooseRelayPrinter })).resolves.toBe("relay");
    expect(chooseRelayPrinter).toHaveBeenCalledWith([p1, p2]);
    expect(sendTicketToRelay).toHaveBeenCalledWith(expect.anything(), "p2");
    expect(rememberPrinter).toHaveBeenCalledWith("b1", "p2");
  });

  it("varias impresoras y el usuario cancela la selección: no imprime ni abre el panel", async () => {
    vi.mocked(fetchRelayPrinters).mockResolvedValue([p1, p2]);
    const chooseRelayPrinter = vi.fn().mockResolvedValue(null);
    await expect(printSaleTicketViaAgent(ticket(), { branchId: "b1", chooseRelayPrinter })).resolves.toBe("cancelled");
    expect(sendTicketToRelay).not.toHaveBeenCalled();
    expect(printSaleTicket).not.toHaveBeenCalled();
  });

  it("varias impresoras y sin selector disponible: panel", async () => {
    vi.mocked(fetchRelayPrinters).mockResolvedValue([p1, p2]);
    await expect(printSaleTicketViaAgent(ticket(), { branchId: "b1" })).resolves.toBe("panel");
    expect(sendTicketToRelay).not.toHaveBeenCalled();
  });

  it("el relay falla al crear el job: avisa por onRelayFailure y cae al panel", async () => {
    const boom = new Error("La impresora está desactivada");
    vi.mocked(sendTicketToRelay).mockRejectedValue(boom);
    const onRelayFailure = vi.fn();
    await expect(printSaleTicketViaAgent(ticket(), { branchId: "b1", onRelayFailure })).resolves.toBe("panel");
    expect(onRelayFailure).toHaveBeenCalledWith(boom);
    expect(printSaleTicket).toHaveBeenCalledTimes(1);
  });
});

describe("printSaleTicketViaAgent — panelFallback:false (celular)", () => {
  const p1 = { id: "p1", name: "Caja", branchId: "b1", agentOnline: true };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAgentEnabled).mockReturnValue(false);
    vi.mocked(fetchRelayPrinters).mockResolvedValue([]);
  });

  it("la lista de impresoras falla: 'failed', avisa el error y no abre el panel", async () => {
    const boom = new Error("Sin permiso");
    vi.mocked(fetchRelayPrinters).mockRejectedValue(boom);
    const onRelayFailure = vi.fn();
    await expect(
      printSaleTicketViaAgent(ticket(), { branchId: "b1", panelFallback: false, onRelayFailure }),
    ).resolves.toBe("failed");
    expect(onRelayFailure).toHaveBeenCalledWith(boom);
    expect(printSaleTicket).not.toHaveBeenCalled();
  });

  it("el envío falla: 'failed', avisa el error y no abre el panel", async () => {
    const boom = new Error("500");
    vi.mocked(fetchRelayPrinters).mockResolvedValue([p1]);
    vi.mocked(sendTicketToRelay).mockRejectedValue(boom);
    const onRelayFailure = vi.fn();
    await expect(
      printSaleTicketViaAgent(ticket(), { branchId: "b1", panelFallback: false, onRelayFailure }),
    ).resolves.toBe("failed");
    expect(onRelayFailure).toHaveBeenCalledWith(boom);
    expect(printSaleTicket).not.toHaveBeenCalled();
  });

  it("sin impresoras activas: 'no-printers' sin panel ni onRelayFailure", async () => {
    const onRelayFailure = vi.fn();
    await expect(
      printSaleTicketViaAgent(ticket(), { branchId: "b1", panelFallback: false, onRelayFailure }),
    ).resolves.toBe("no-printers");
    expect(onRelayFailure).not.toHaveBeenCalled();
    expect(printSaleTicket).not.toHaveBeenCalled();
  });

  it("varias impresoras sin chooser: no abre el panel", async () => {
    const p2 = { ...p1, id: "p2" };
    vi.mocked(fetchRelayPrinters).mockResolvedValue([p1, p2]);
    await expect(
      printSaleTicketViaAgent(ticket(), { branchId: "b1", panelFallback: false }),
    ).resolves.not.toBe("panel");
    expect(printSaleTicket).not.toHaveBeenCalled();
  });

  it("por defecto (panelFallback omitido) sigue cayendo al panel", async () => {
    vi.mocked(fetchRelayPrinters).mockRejectedValue(new Error("x"));
    await expect(printSaleTicketViaAgent(ticket(), { branchId: "b1" })).resolves.toBe("panel");
  });
});

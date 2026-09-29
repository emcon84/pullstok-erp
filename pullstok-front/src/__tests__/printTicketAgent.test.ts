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

import { printSaleTicketViaAgent } from "@/utils/printTicketAgent";
import { isAgentEnabled, printBytesViaAgent } from "@/utils/directPrintAgent";
import { buildSaleTicket, printSaleTicket } from "@/utils/saleTicket";
import { prepareTicketLogoBitmap } from "@/utils/ticketLogo";

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

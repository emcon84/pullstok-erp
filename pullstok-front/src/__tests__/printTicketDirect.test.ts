import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/serialPrinter", () => ({
  isSerialPrintingSupported: vi.fn(),
  getConnectedPrinterPort: vi.fn(),
  printBytes: vi.fn(),
}));
vi.mock("@/utils/saleTicket", async () => {
  const actual = await vi.importActual<typeof import("@/utils/saleTicket")>("@/utils/saleTicket");
  return { ...actual, printSaleTicket: vi.fn() };
});
vi.mock("@/utils/ticketLogo", () => ({ prepareTicketLogoBitmap: vi.fn() }));

import { printSaleTicketDirect } from "@/utils/printTicketDirect";
import { isSerialPrintingSupported, getConnectedPrinterPort, printBytes } from "@/utils/serialPrinter";
import { buildSaleTicket, printSaleTicket } from "@/utils/saleTicket";
import { prepareTicketLogoBitmap } from "@/utils/ticketLogo";

// printSaleTicketDirect: directo por Web Serial si hay impresora conectada; en
// cualquier otro caso (o ante cualquier error) cae al panel de Chrome. Nunca lanza.

const ticket = (over = {}) =>
  buildSaleTicket({
    issuedAt: "2026-09-24T15:30:00",
    businessName: "Mi Pet Shop",
    items: [{ name: "Royal Canin 15kg", price: 8000, quantity: 2 }],
    payments: [{ method: "EFECTIVO", amount: 16000 }],
    ...over,
  });

const port = { fake: true } as never;

function connected() {
  vi.mocked(isSerialPrintingSupported).mockReturnValue(true);
  vi.mocked(getConnectedPrinterPort).mockResolvedValue(port);
  vi.mocked(printBytes).mockResolvedValue(undefined);
}

const indexOfSeq = (bytes: Uint8Array, seq: number[]) => {
  outer: for (let i = 0; i <= bytes.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
};

describe("printSaleTicketDirect", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(printSaleTicket).mockResolvedValue(undefined);
    vi.mocked(prepareTicketLogoBitmap).mockResolvedValue(null);
  });

  it("no soportado → panel de Chrome, sin intentar el puerto ni avisar de error", async () => {
    vi.mocked(isSerialPrintingSupported).mockReturnValue(false);
    const onDirectFailure = vi.fn();

    await expect(printSaleTicketDirect(ticket(), { onDirectFailure })).resolves.toBe("panel");

    expect(printSaleTicket).toHaveBeenCalledTimes(1);
    expect(getConnectedPrinterPort).not.toHaveBeenCalled();
    expect(printBytes).not.toHaveBeenCalled();
    expect(onDirectFailure).not.toHaveBeenCalled();
  });

  it("soportado pero sin impresora conectada → panel, sin avisar de error", async () => {
    vi.mocked(isSerialPrintingSupported).mockReturnValue(true);
    vi.mocked(getConnectedPrinterPort).mockResolvedValue(null);
    const onDirectFailure = vi.fn();

    await expect(printSaleTicketDirect(ticket(), { onDirectFailure })).resolves.toBe("panel");

    expect(printBytes).not.toHaveBeenCalled();
    expect(printSaleTicket).toHaveBeenCalledTimes(1);
    expect(onDirectFailure).not.toHaveBeenCalled();
  });

  it("impresora conectada → imprime directo (ESC @ ... ) y NO abre el panel", async () => {
    connected();

    await expect(printSaleTicketDirect(ticket())).resolves.toBe("direct");

    expect(printBytes).toHaveBeenCalledTimes(1);
    const bytes = vi.mocked(printBytes).mock.calls[0][0];
    expect([bytes[0], bytes[1]]).toEqual([0x1b, 0x40]);
    const text = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
    expect(text).toContain("Royal Canin 15kg");
    expect(text).toContain("TOTAL");
    expect(printSaleTicket).not.toHaveBeenCalled();
  });

  it("el envío falla → avisa el error y cae al panel con el mismo ticket", async () => {
    connected();
    const boom = new Error("Bluetooth desconectado");
    vi.mocked(printBytes).mockRejectedValue(boom);
    const order: string[] = [];
    const onDirectFailure = vi.fn(() => order.push("aviso"));
    vi.mocked(printSaleTicket).mockImplementation(async () => {
      order.push("panel");
    });
    const t = ticket();

    await expect(printSaleTicketDirect(t, { onDirectFailure })).resolves.toBe("panel");

    expect(onDirectFailure).toHaveBeenCalledWith(boom);
    expect(printSaleTicket).toHaveBeenCalledWith(t);
    // El aviso sale ANTES del panel: window.print() bloquea el hilo.
    expect(order).toEqual(["aviso", "panel"]);
  });

  it("getConnectedPrinterPort lanza → panel y aviso (nunca lanza)", async () => {
    vi.mocked(isSerialPrintingSupported).mockReturnValue(true);
    vi.mocked(getConnectedPrinterPort).mockRejectedValue(new Error("boom"));
    const onDirectFailure = vi.fn();

    await expect(printSaleTicketDirect(ticket(), { onDirectFailure })).resolves.toBe("panel");
    expect(onDirectFailure).toHaveBeenCalled();
    expect(printSaleTicket).toHaveBeenCalled();
  });

  it("un onDirectFailure que lanza no impide el panel", async () => {
    connected();
    vi.mocked(printBytes).mockRejectedValue(new Error("x"));
    const onDirectFailure = vi.fn(() => {
      throw new Error("toast roto");
    });

    await expect(printSaleTicketDirect(ticket(), { onDirectFailure })).resolves.toBe("panel");
    expect(printSaleTicket).toHaveBeenCalled();
  });

  it("nunca lanza aunque el panel de respaldo también falle", async () => {
    vi.mocked(isSerialPrintingSupported).mockReturnValue(false);
    vi.mocked(printSaleTicket).mockRejectedValue(new Error("sin iframe"));
    await expect(printSaleTicketDirect(ticket())).resolves.toBe("panel");

    vi.mocked(printSaleTicket).mockImplementation(() => {
      throw new Error("sync");
    });
    await expect(printSaleTicketDirect(ticket())).resolves.toBe("panel");
  });

  it("con logo: lo rasteriza y lo incluye (GS v 0)", async () => {
    connected();
    // 8x2, todo negro.
    vi.mocked(prepareTicketLogoBitmap).mockResolvedValue({
      width: 8,
      height: 2,
      data: new Uint8ClampedArray(8 * 2 * 4).fill(0).map((v, i) => (i % 4 === 3 ? 255 : v)),
    });

    await printSaleTicketDirect(ticket({ logoUrl: "https://cdn.test/logo.png" }));

    expect(prepareTicketLogoBitmap).toHaveBeenCalledWith("https://cdn.test/logo.png");
    const bytes = vi.mocked(printBytes).mock.calls[0][0];
    const at = indexOfSeq(bytes, [0x1d, 0x76, 0x30, 0x00]);
    expect(at).toBeGreaterThan(-1);
    expect(Array.from(bytes.slice(at + 4, at + 10))).toEqual([1, 0, 2, 0, 0xff, 0xff]);
  });

  it("logo que no se puede rasterizar (null o error) → se imprime igual, sin logo", async () => {
    connected();
    vi.mocked(prepareTicketLogoBitmap).mockResolvedValue(null);
    await expect(printSaleTicketDirect(ticket({ logoUrl: "https://cdn.test/l.png" }))).resolves.toBe("direct");
    expect(indexOfSeq(vi.mocked(printBytes).mock.calls[0][0], [0x1d, 0x76, 0x30])).toBe(-1);

    vi.mocked(prepareTicketLogoBitmap).mockRejectedValue(new Error("canvas"));
    await expect(printSaleTicketDirect(ticket({ logoUrl: "https://cdn.test/l.png" }))).resolves.toBe("direct");
    expect(printSaleTicket).not.toHaveBeenCalled();
  });

  it("sin logoUrl no intenta rasterizar", async () => {
    connected();
    await printSaleTicketDirect(ticket({ logoUrl: null }));
    expect(prepareTicketLogoBitmap).not.toHaveBeenCalled();
  });
});

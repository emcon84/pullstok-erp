/**
 * Unit tests — accountStatementPdf (cuenta-corriente T1): genera el PDF del
 * resumen de cuenta (membrete + saldo + tabla de movimientos). `compress:
 * false` a propósito (ver accountStatementPdf.ts) para poder buscar texto en
 * el buffer sin inflar el content stream.
 */
import { buildAccountStatementPdf } from "../../src/services/accountStatementPdf";

const baseInput = {
  customer: { name: "Ana Perez" },
  organization: {
    name: "Pullstok",
    address: "Av. Siempre Viva 742",
    phone: "3400123456",
    taxId: "20304050607",
    taxCondition: "Responsable Inscripto",
  },
  logoUrl: null as string | null,
  balance: 1234.5,
  movements: [
    {
      id: "m-1",
      type: "CHARGE" as const,
      amount: 1500,
      method: null,
      note: null,
      createdAt: new Date("2026-09-01T12:00:00Z"),
      sale: { id: "s-1", saleDate: new Date("2026-09-01T12:00:00Z") },
    },
    {
      id: "m-2",
      type: "PAYMENT" as const,
      amount: 265.5,
      method: "TRANSFERENCIA",
      note: "seña",
      createdAt: new Date("2026-09-10T12:00:00Z"),
      sale: null,
    },
  ],
};

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

/**
 * pdfkit (compress: false) still shows text as hex strings inside TJ arrays
 * with kerning adjustments between glyphs (`[<...> N <...> N ...] TJ`), never
 * as plain ASCII — so a raw buffer.toString() search would never match. This
 * pulls every hex string out of the content stream, in order, and decodes it
 * back to text; the numeric kerning offsets are dropped but the character
 * order (and thus any word/number) is preserved.
 */
const extractPdfText = (buffer: Buffer): string =>
  (buffer.toString("latin1").match(/<[0-9a-fA-F]+>/g) ?? [])
    .map((hex) => Buffer.from(hex.slice(1, -1), "hex").toString("latin1"))
    .join("");

describe("accountStatementPdf.buildAccountStatementPdf", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns a non-empty PDF buffer (magic bytes) and never fetches when logoUrl is null", async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    const buffer = await buildAccountStatementPdf(baseInput);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("includes the customer name, movement amounts, method and type labels", async () => {
    const buffer = await buildAccountStatementPdf(baseInput);
    const text = extractPdfText(buffer);

    expect(text).toContain("Ana Perez");
    expect(text).toContain("1.500,00");
    expect(text).toContain("265,50");
    expect(text).toContain("Transferencia");
    expect(text).toContain("Venta");
    expect(text).toContain("Cobranza");
  });

  it("labels a CHARGE without a sale as \"Deuda anterior\" (historical charge)", async () => {
    const buffer = await buildAccountStatementPdf({
      ...baseInput,
      movements: [
        {
          id: "m-h",
          type: "CHARGE" as const,
          amount: 800,
          method: null,
          note: "ventas 2025",
          createdAt: new Date("2025-06-01T12:00:00Z"),
          sale: null,
        },
      ],
    });
    const text = extractPdfText(buffer);
    expect(text).toContain("Deuda anterior");
    expect(text).toContain("ventas 2025");
    expect(text).not.toContain("Venta");
  });

  it.each([
    [1234.5, "Saldo adeudado"],
    [-50, "Saldo a favor"],
    [0, "Sin saldo"],
  ])("renders the right balance label for balance=%s", async (balance, label) => {
    const buffer = await buildAccountStatementPdf({ ...baseInput, balance, movements: [] });
    expect(extractPdfText(buffer)).toContain(label);
  });

  it("fetches and embeds the logo when logoUrl is set and the fetch succeeds", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        PNG_1x1.buffer.slice(PNG_1x1.byteOffset, PNG_1x1.byteOffset + PNG_1x1.byteLength),
    });
    global.fetch = fetchMock as any;

    const buffer = await buildAccountStatementPdf({
      ...baseInput,
      logoUrl: "https://cdn.example.com/logo.png",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://cdn.example.com/logo.png");
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("skips the logo gracefully (never throws) when the fetch rejects", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as any;

    const buffer = await buildAccountStatementPdf({
      ...baseInput,
      logoUrl: "https://cdn.example.com/logo.png",
    });

    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("skips the logo gracefully (never throws) when the response is not ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as any;

    const buffer = await buildAccountStatementPdf({
      ...baseInput,
      logoUrl: "https://cdn.example.com/missing.png",
    });

    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("maps payment methods to readable Spanish labels", async () => {
    const mk = (id: string, method: string) => ({
      id,
      type: "PAYMENT" as const,
      amount: 1,
      method,
      note: null,
      createdAt: new Date("2026-09-10T12:00:00Z"),
      sale: null,
    });
    const text = extractPdfText(
      await buildAccountStatementPdf({
        ...baseInput,
        movements: [mk("a", "EFECTIVO"), mk("b", "TARJETA_CREDITO"), mk("c", "TARJETA_DEBITO"), mk("d", "QR")],
      }),
    );
    expect(text).toContain("Efectivo");
    expect(text).toContain("Tarjeta de crédito");
    expect(text).toContain("Tarjeta de débito");
    expect(text).not.toContain("TARJETA_CREDITO");
  });

  it("shows a running balance column, computed oldest to newest, rows oldest first", async () => {
    // Input is newest-first (as getAccount returns it).
    const text = extractPdfText(
      await buildAccountStatementPdf({
        ...baseInput,
        movements: [...baseInput.movements].reverse(),
      }),
    );
    expect(text).toContain("Saldo acumulado");
    const afterCharge = text.indexOf("1.500,00");
    const afterPayment = text.lastIndexOf("1.234,50");
    expect(afterCharge).toBeGreaterThan(-1);
    expect(afterPayment).toBeGreaterThan(afterCharge);
    // oldest first: the sale row comes before the payment row
    expect(text.indexOf("Venta")).toBeLessThan(text.indexOf("Cobranza"));
  });

  it("renders the header band, emission date and page footer", async () => {
    const text = extractPdfText(await buildAccountStatementPdf(baseInput));
    expect(text).toContain("RESUMEN DE CUENTA");
    expect(text).toContain("Emitido el");
    expect(text).toContain("Página 1 de 1");
  });

  it("paginates long statements: repeats the table header and numbers pages", async () => {
    const movements = Array.from({ length: 80 }, (_, i) => ({
      id: `m-${i}`,
      type: "CHARGE" as const,
      amount: 10,
      method: null,
      note: "Deuda anterior de prueba con una nota bastante larga para forzar el salto de línea en la columna",
      createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 28))),
      sale: null,
    }));
    const text = extractPdfText(await buildAccountStatementPdf({ ...baseInput, balance: 800, movements }));
    const headers = text.split("Saldo acumulado").length - 1;
    expect(headers).toBeGreaterThanOrEqual(2);
    expect(text).toMatch(/Página 1 de [2-9]/);
    expect(text).toContain("columna");
  });
});

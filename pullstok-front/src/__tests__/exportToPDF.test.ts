import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type jsPDF from "jspdf";

// jsPDF v4 adjunta los métodos API a cada instancia (no al prototype), así
// que un spy de prototype no sirve. Se mockea el módulo con una subclase que
// re-expone save/text/rect/addImage como spies para poder asertar el layout
// sin construir un PDF real (que además no es necesario en jsdom).
const { saveMock, textSpy, rectSpy, addImageSpy } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  textSpy: vi.fn(),
  rectSpy: vi.fn(),
  addImageSpy: vi.fn(),
}));

vi.mock("jspdf", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof jsPDF }>();
  const Base = actual.default;
  class MockJsPDF extends Base {
    save = saveMock;
    text = (...args: unknown[]) => {
      textSpy(...args);
      return this;
    };
    rect = (...args: unknown[]) => {
      rectSpy(...args);
      return this;
    };
    addImage = (...args: unknown[]) => {
      addImageSpy(...args);
      return this;
    };
  }
  return { default: MockJsPDF };
});

// El QR fiscal AFIP se mockea aparte (drawAfipQr vive en su propio módulo,
// afipQr.ts) para aislar las aserciones de layout.
vi.mock("../utils/afipQr", () => ({
  drawAfipQr: vi.fn(),
  buildAfipQrUrl: vi.fn(),
}));

import { exportToPDF } from "../utils/exportToPDF";
import { drawAfipQr } from "../utils/afipQr";

const hasText = (needle: string) =>
  textSpy.mock.calls.some((call) => call[0] === needle);

const genericData = {
  title: "Presupuesto",
  documentNumber: "PRE-0001",
  date: "20/08/2026",
  customer: "Cliente S.A.",
  items: [{ quantity: 1, name: "Producto X", price: 100, total: 100 }],
  total: 100,
};

const fiscalBase = {
  title: "Factura",
  documentNumber: "0002-00000013",
  date: "21/08/2026",
  customer: "ACME S.A.",
  issuer: {
    name: "Mi Empresa S.R.L.",
    taxId: "30-12345678-9",
    taxCondition: "IVA Responsable Inscripto",
    address: "Av. Siempre Viva 123",
  },
  customerTaxId: "30-98765432-1",
  customerTaxCondition: "IVA Responsable Inscripto",
  customerAddress: "Calle Falsa 456",
  items: [
    {
      quantity: 2,
      name: "Servicio de consultoría",
      price: 50000,
      taxRate: 21,
      total: 100000,
    },
  ],
  subtotal: 100000,
  taxAmount: 21000,
  total: 121000,
};

const fiscalData = {
  ...fiscalBase,
  tipoComprobante: "1",
  puntoVenta: 2,
  cbteNro: 13,
  cae: "71907643210631",
  caeVencimiento: "2026-11-21",
};

beforeEach(() => {
  saveMock.mockClear();
  textSpy.mockClear();
  rectSpy.mockClear();
  addImageSpy.mockClear();
  vi.mocked(drawAfipQr).mockClear();
  vi.mocked(drawAfipQr).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exportToPDF genérico (backwards-compatible)", () => {
  it("ExportData puro sigue generando el PDF genérico", async () => {
    await exportToPDF(genericData);

    expect(saveMock).toHaveBeenCalledWith("Presupuesto_PRE-0001.pdf");
    expect(hasText("Presupuesto")).toBe(true);
    expect(hasText(`Número: PRE-0001`)).toBe(true);
    expect(
      hasText("Comprobante no fiscal — no válido como factura AFIP"),
    ).toBe(true);
    expect(drawAfipQr).not.toHaveBeenCalled();
    expect(addImageSpy).not.toHaveBeenCalled();
  });

  it("datos fiscales de emisor/cliente SIN CAE mantienen el layout genérico", async () => {
    await exportToPDF(fiscalBase);

    expect(hasText("Comprobante no fiscal — no válido como factura AFIP")).toBe(
      true,
    );
    expect(
      hasText(`Emisor: Mi Empresa S.R.L. — CUIT/Tax ID: 30-12345678-9`),
    ).toBe(true);
    expect(hasText("FACTURA A")).toBe(false);
    expect(drawAfipQr).not.toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledWith("Factura_0002-00000013.pdf");
  });
});

describe("exportToPDF fiscal (CAE presente)", () => {
  it("genera el comprobante estándar: rótulo ORIGINAL, letra, título, número, CAE y QR", async () => {
    await exportToPDF(fiscalData);

    expect(saveMock).toHaveBeenCalledWith("Factura_0002-00000013.pdf");

    // Rótulo ORIGINAL y recuadro con la letra del comprobante
    expect(hasText("ORIGINAL")).toBe(true);
    expect(hasText("A")).toBe(true);

    // Header derecho
    expect(hasText("FACTURA A")).toBe(true);
    expect(hasText("0002-00000013")).toBe(true);
    expect(hasText("Fecha de emisión: 21/08/2026")).toBe(true);
    expect(hasText("Punto de venta: 0002")).toBe(true);

    // Emisor
    expect(hasText("Mi Empresa S.R.L.")).toBe(true);
    expect(hasText("CUIT: 30-12345678-9")).toBe(true);

    // Receptor
    expect(hasText("Cliente: ACME S.A.")).toBe(true);
    expect(hasText("CUIT: 30-98765432-1")).toBe(true);

    // Zona CAE + leyenda autorizada
    expect(hasText("CAE: 71907643210631")).toBe(true);
    expect(hasText("Vencimiento CAE: 21/11/2026")).toBe(true);
    expect(hasText("Comprobante autorizado por ARCA")).toBe(true);
    expect(hasText("AFIP - Comprobante Autorizado")).toBe(true);
    expect(
      hasText("Comprobante no fiscal — no válido como factura AFIP"),
    ).toBe(false);

    // QR mockeado: recibe el doc, el payload AFIP (RG 4892/2020) armado
    // desde InvoicePdfData y las coordenadas del recuadro.
    expect(drawAfipQr).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fecha: "2026-08-21",
        cuit: 30123456789,
        ptoVta: 2,
        tipoCmp: 1,
        nroCmp: 13,
        importe: 121000,
        codAut: 71907643210631,
      }),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );

    // Recuadro de la zona CAE (y el de la letra del comprobante)
    expect(rectSpy).toHaveBeenCalled();

    // Sin logo no se dibuja imagen
    expect(addImageSpy).not.toHaveBeenCalled();
  });

  it("incluye docTipoReceptor/docNroReceptor en el payload del QR cuando vienen", async () => {
    await exportToPDF({
      ...fiscalData,
      docTipoReceptor: 80,
      docNroReceptor: "20-98765432-1",
    });

    expect(drawAfipQr).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tipoDocRec: 80,
        nroDocRec: 20987654321,
      }),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("mapea tipoComprobante '6' a FACTURA B", async () => {
    await exportToPDF({ ...fiscalData, tipoComprobante: "6" });

    expect(hasText("FACTURA B")).toBe(true);
    expect(hasText("FACTURA A")).toBe(false);
    expect(hasText("B")).toBe(true);
  });

  it("usa documentNumber como fallback si faltan puntoVenta/cbteNro", async () => {
    await exportToPDF({
      ...fiscalData,
      puntoVenta: undefined,
      cbteNro: undefined,
    });

    expect(hasText("0002-00000013")).toBe(true);
  });

  it("falla silencioso del logo: sigue generando el comprobante", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    await exportToPDF({ ...fiscalData, logoUrl: "https://cdn.example/logo.png" });

    expect(hasText("FACTURA A")).toBe(true);
    expect(addImageSpy).not.toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledWith("Factura_0002-00000013.pdf");
  });

  it("QR con payload inválido cae al fallback de texto (no rompe)", async () => {
    vi.mocked(drawAfipQr).mockImplementation(() => {
      throw new Error("QR AFIP: CAE inválido");
    });

    await exportToPDF({ ...fiscalData, cae: "ABC-123" });

    expect(saveMock).toHaveBeenCalledWith("Factura_0002-00000013.pdf");
    expect(hasText("Comprobante autorizado por ARCA")).toBe(true);
    expect(hasText("ABC-123")).toBe(true);
  });
});
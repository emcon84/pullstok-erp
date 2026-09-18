import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type jsPDF from "jspdf";

// jsPDF v4 adjunta los métodos API a cada instancia (no al prototype): se
// mockea el módulo con una subclase que re-expone save/text/rect como spies,
// mismo patrón que exportToPDF.test.ts.
const { saveMock, textSpy, rectSpy, addPageSpy } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  textSpy: vi.fn(),
  rectSpy: vi.fn(),
  addPageSpy: vi.fn(),
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
    addPage = (...args: unknown[]) => {
      addPageSpy(...args);
      return this;
    };
  }
  return { default: MockJsPDF };
});

vi.mock("../utils/caeBarcode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/caeBarcode")>();
  return {
    ...actual,
    code128BSymbols: vi.fn(actual.code128BSymbols),
  };
});

import { exportBarcodeLabels } from "../utils/exportBarcodeLabels";
import { code128BSymbols } from "../utils/caeBarcode";

const code128Mock = vi.mocked(code128BSymbols);

beforeEach(() => {
  saveMock.mockClear();
  textSpy.mockClear();
  rectSpy.mockClear();
  addPageSpy.mockClear();
  code128Mock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("exportBarcodeLabels", () => {
  it("no genera nada con un array vacío", () => {
    exportBarcodeLabels([]);

    expect(saveMock).not.toHaveBeenCalled();
    expect(code128Mock).not.toHaveBeenCalled();
  });

  it("no lanza con etiquetas válidas y descarga el PDF", () => {
    expect(() =>
      exportBarcodeLabels([
        { name: "Producto Uno", barcode: "INT00001" },
        { name: "Producto Dos", barcode: "INT00002" },
      ]),
    ).not.toThrow();

    expect(saveMock).toHaveBeenCalledWith("codigos-barra.pdf");
  });

  it("llama a code128BSymbols una vez por cada etiqueta", () => {
    exportBarcodeLabels([
      { name: "A", barcode: "INT00001" },
      { name: "B", barcode: "INT00002" },
      { name: "C", barcode: "INT00003" },
    ]);

    expect(code128Mock).toHaveBeenCalledTimes(3);
    expect(code128Mock).toHaveBeenCalledWith("INT00001");
    expect(code128Mock).toHaveBeenCalledWith("INT00002");
    expect(code128Mock).toHaveBeenCalledWith("INT00003");
  });

  it("escribe el nombre y el texto del código de barras", () => {
    exportBarcodeLabels([{ name: "Producto Test", barcode: "INT00099" }]);

    const texts = textSpy.mock.calls.map((call) => call[0]);
    expect(texts).toContain("Producto Test");
    expect(texts).toContain("INT00099");
  });

  it("dibuja barras (rect) para cada etiqueta", () => {
    exportBarcodeLabels([{ name: "Producto", barcode: "INT00001" }]);

    expect(rectSpy).toHaveBeenCalled();
  });

  it("agrega una página nueva cuando se supera la grilla de la primera", () => {
    const labels = Array.from({ length: 40 }, (_, i) => ({
      name: `Producto ${i}`,
      barcode: `INT${String(i).padStart(5, "0")}`,
    }));

    exportBarcodeLabels(labels);

    expect(addPageSpy).toHaveBeenCalled();
  });
});

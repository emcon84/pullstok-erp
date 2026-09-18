import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/productService", () => ({
  getBarcodesReport: vi.fn(),
  generateProductBarcode: vi.fn(),
}));

vi.mock("@/utils/exportBarcodeLabels", () => ({
  exportBarcodeLabels: vi.fn(),
}));

import { GeneratedBarcodes } from "@/views/GeneratedBarcodes";
import {
  getBarcodesReport,
  generateProductBarcode,
  type BarcodesReport,
} from "@/services/productService";
import { exportBarcodeLabels } from "@/utils/exportBarcodeLabels";
import { toast } from "react-toastify";

const mockGetReport = vi.mocked(getBarcodesReport);
const mockGenerate = vi.mocked(generateProductBarcode);
const mockExport = vi.mocked(exportBarcodeLabels);
const toastErrorMock = vi.mocked(toast.error);

const report: BarcodesReport = {
  total: 2,
  conBarcode: 1,
  sinBarcode: 1,
  items: [
    {
      id: "p1",
      name: "Producto Sin Código",
      category: "Accesorios",
      code: "SKU1",
      barcode: "",
      hasBarcode: false,
    },
    {
      id: "p2",
      name: "Producto Con Código",
      category: "Alimento",
      code: "SKU2",
      barcode: "INT00001",
      hasBarcode: true,
    },
  ],
};

describe("GeneratedBarcodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReport.mockResolvedValue(report);
  });

  it("muestra loading y luego el reporte cargado", async () => {
    render(<GeneratedBarcodes />);

    expect(screen.getByText(/cargando/i)).toBeInTheDocument();

    expect(await screen.findByText("Producto Sin Código")).toBeInTheDocument();
    expect(screen.getByText("Producto Con Código")).toBeInTheDocument();
    expect(screen.getByText("Total: 2")).toBeInTheDocument();
  });

  it("clic en Generar código llama al servicio y actualiza la fila", async () => {
    mockGenerate.mockResolvedValue({
      id: "p1",
      name: "Producto Sin Código",
      barcode: "INT00099",
    });
    render(<GeneratedBarcodes />);

    await screen.findByText("Producto Sin Código");
    fireEvent.click(screen.getByRole("button", { name: "Generar código" }));

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith("p1"));
    expect(await screen.findByText("INT00099")).toBeInTheDocument();
  });

  it("muestra un toast con el error del backend si falla la generación", async () => {
    mockGenerate.mockRejectedValue(new Error("el producto ya tiene un código de barras"));
    render(<GeneratedBarcodes />);

    await screen.findByText("Producto Sin Código");
    fireEvent.click(screen.getByRole("button", { name: "Generar código" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "el producto ya tiene un código de barras",
      ),
    );
  });

  it("seleccionar una fila con código e imprimir llama al export util", async () => {
    render(<GeneratedBarcodes />);

    await screen.findByText("Producto Con Código");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Seleccionar Producto Con Código para imprimir",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /imprimir seleccionados/i }));

    expect(mockExport).toHaveBeenCalledWith([
      { name: "Producto Con Código", barcode: "INT00001" },
    ]);
  });
});

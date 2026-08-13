import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/priceLists", () => ({
  importPriceList: vi.fn(),
  applyPriceList: vi.fn(),
  searchProducts: vi.fn(),
}));

import { PriceListImport } from "@/views/PriceListImport";
import {
  importPriceList,
  applyPriceList,
  searchProducts,
  type PriceListPreview,
} from "@/services/priceLists";

const mockImport = vi.mocked(importPriceList);
const mockApply = vi.mocked(applyPriceList);
const mockSearch = vi.mocked(searchProducts);

const preview: PriceListPreview = {
  layout: "SECO",
  period: "2026-08-10",
  sourceFilename: "planilla.pdf",
  total: 3,
  rows: [
    {
      position: 0,
      nombre: "SIEGER Puppy Mini x 1 Kg.",
      unidadEmpaque: "1 Kg.",
      marca: "SIEGER",
      linea: "SUPER PREMIUM PARA PERROS",
      sublinea: "SIEGER PUPPY",
      precioSinIva: 8795,
      precioConIva: 10642,
      sugerido: 14190.04,
      estado: "matched",
      productId: "p-1",
      productIds: ["p-1"],
      matchName: "SIEGER Puppy Mini x 1 Kg.",
    },
    {
      position: 1,
      nombre: "GOOSTER Sin Precio x 15 Kg.",
      unidadEmpaque: null,
      marca: "GOOSTER",
      linea: null,
      sublinea: null,
      precioSinIva: null,
      precioConIva: null,
      sugerido: null,
      estado: "error",
      productId: null,
    },
    {
      position: 2,
      nombre: "Producto Sin Match x 3 Kg.",
      unidadEmpaque: "3 Kg.",
      marca: "SIEGER",
      linea: null,
      sublinea: null,
      precioSinIva: 1000,
      precioConIva: 1210,
      sugerido: 1613.4,
      estado: "unmatched",
      productId: null,
    },
  ],
};

const uploadPdf = async () => {
  const input = screen.getByLabelText("Archivo PDF (máx. 10MB)");
  const file = new File(["pdf"], "planilla.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() =>
    expect(screen.getByText(/2\. Revisar matcheo/)).toBeInTheDocument(),
  );
};

/** Abre el diálogo de confirmación y confirma la importación. */
const confirmImport = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Importar planilla" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar importación" }));
  await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
};

describe("PriceListImport — wizard de importación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImport.mockResolvedValue(preview);
    mockApply.mockResolvedValue({
      priceListId: "pl-1",
      imported: 1,
      omitted: 2,
      suggestedUpdated: 1,
      priceUpdated: 1,
      productsCreated: 1,
    });
    mockSearch.mockResolvedValue([
      { id: "p-9", name: "GOOSTER Sin Precio x 15 Kg." },
    ]);
  });

  it("muestra el paso 1 y rechaza un PDF de más de 10MB client-side", async () => {
    render(<PriceListImport />);
    expect(screen.getByText("1. Subir planilla")).toBeInTheDocument();

    const input = screen.getByLabelText("Archivo PDF (máx. 10MB)");
    const bigFile = new File(["x".repeat(11 * 1024 * 1024)], "grande.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [bigFile] } });
    expect(await screen.findByText("El archivo excede 10MB")).toBeInTheDocument();
    expect(mockImport).not.toHaveBeenCalled();
  });

  it("muestra el preview con los badges de estado y los defaults (importAll ON: matched y sin matchear import, error omit; aplicar precios default ON)", async () => {
    render(<PriceListImport />);
    await uploadPdf();

    expect(screen.getByText("Matcheado")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Sin matchear")).toBeInTheDocument();

    // Default con "Importar todas las filas" ON: matched → import,
    // error → omit, sin matchear → import. "Aplicar precios" default ON.
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked(); // importar todas (default ON)
    expect(checkboxes[1]).toBeChecked(); // aplicar precios al catálogo (default ON)
    expect(checkboxes[2]).toBeChecked(); // matched → import
    expect(checkboxes[3]).not.toBeChecked(); // error → omit
    expect(checkboxes[4]).toBeChecked(); // sin matchear → import
  });

  it("toggle a una fila matched a omit y envía el payload correcto al aplicar", async () => {
    render(<PriceListImport />);
    await uploadPdf();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[2]); // desmarcar la fila matched
    // la fila sin matchear ya viene import por default (importAll ON)

    await confirmImport();

    const payload = mockApply.mock.calls[0][0];
    expect(payload.layout).toBe("SECO");
    expect(payload.period).toBe("2026-08-10");
    expect(payload.sourceFilename).toBe("planilla.pdf");
    expect(payload.applyPrices).toBe(true); // default ON
    expect(payload.rows).toHaveLength(3);
    expect(payload.rows[0]).toMatchObject({
      position: 0,
      accion: "omit",
      productId: "p-1",
      nombre: "SIEGER Puppy Mini x 1 Kg.",
    });
    expect(payload.rows[2]).toMatchObject({
      position: 2,
      accion: "import",
      nombre: "Producto Sin Match x 3 Kg.",
    });
  });

  it("con 'Importar todas las filas' ON (default), el payload incluye las filas sin matchear como import SIN productId y omite las de error", async () => {
    render(<PriceListImport />);
    await uploadPdf();

    await confirmImport();

    const payload = mockApply.mock.calls[0][0];
    // Sin matchear → import, sin productId (se creará con "aplicar precios" ON).
    expect(payload.rows[2]).toMatchObject({
      position: 2,
      accion: "import",
      nombre: "Producto Sin Match x 3 Kg.",
    });
    expect(payload.rows[2].productId).toBeUndefined();
    // Error → omit.
    expect(payload.rows[1]).toMatchObject({
      position: 1,
      accion: "omit",
      nombre: "GOOSTER Sin Precio x 15 Kg.",
    });
    // Matcheada conserva el link.
    expect(payload.rows[0]).toMatchObject({ accion: "import", productId: "p-1" });
  });

  it("desmarcar 'Importar todas las filas' restaura el default anterior (sin matchear omitidas)", async () => {
    render(<PriceListImport />);
    await uploadPdf();

    const importAll = screen.getByLabelText("Importar todas las filas");
    expect(importAll).toBeChecked();
    fireEvent.click(importAll);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).not.toBeChecked(); // importar todas OFF
    expect(checkboxes[4]).not.toBeChecked(); // sin matchear → omit (default anterior)

    await confirmImport();

    const payload = mockApply.mock.calls[0][0];
    expect(payload.rows[2]).toMatchObject({ position: 2, accion: "omit" });
  });

  it("desmarcar 'Aplicar precios al catálogo' envía applyPrices=false y no muestra el preview de creación", async () => {
    render(<PriceListImport />);
    await uploadPdf();

    const aplicarPrecios = screen.getByLabelText("Aplicar precios al catálogo");
    expect(aplicarPrecios).toBeChecked();
    fireEvent.click(aplicarPrecios);

    // Sin preview de creación en el resumen.
    expect(screen.queryByText(/productos a crear/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Importar planilla" }));
    expect(await screen.findByRole("heading", { name: /Confirmar importación/ })).toBeInTheDocument();
    expect(screen.queryByTestId("crear-productos")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar importación" }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));

    expect(mockApply.mock.calls[0][0].applyPrices).toBe(false);
  });

  it("muestra el preview de creación (conteos + nombres) antes de confirmar", async () => {
    render(<PriceListImport />);
    await uploadPdf();

    // Resumen: 1 precio a actualizar (matched) · 1 producto a crear (sin match).
    // Los números viven dentro de <strong> → matcher por subcadena del párrafo.
    expect(screen.getByText((c) => c.includes("precios a actualizar"))).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("productos a crear"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Importar planilla" }));
    expect(await screen.findByRole("heading", { name: /Confirmar importación/ })).toBeInTheDocument();

    // El diálogo lista el nombre del producto que se va a crear.
    const crear = screen.getByTestId("crear-productos");
    expect(within(crear).getByText("Producto Sin Match x 3 Kg.")).toBeInTheDocument();
  });

  it("asigna un producto manualmente a una fila sin matchear y la marca para importar", async () => {
    render(<PriceListImport />);
    await uploadPdf();

    const buscar = screen.getByLabelText("Buscar producto para Producto Sin Match x 3 Kg.");
    fireEvent.change(buscar, { target: { value: "producto sin match" } });
    // El botón Buscar de ESTA fila (hay un selector por fila sin matchear/error).
    fireEvent.click(within(buscar.closest("div")!).getByRole("button", { name: "Buscar" }));

    // El resultado vive dentro de la lista de resultados de esa fila.
    const resultados = await screen.findByTestId("resultados-2");
    fireEvent.click(within(resultados).getByText("GOOSTER Sin Precio x 15 Kg."));

    // La fila sin matchear ahora tiene producto asignado → entra al apply.
    await confirmImport();

    const payload = mockApply.mock.calls[0][0];
    const manual = payload.rows.find(
      (r: { position: number }) => r.position === 2,
    );
    expect(manual).toMatchObject({
      accion: "import",
      productId: "p-9",
      nombre: "Producto Sin Match x 3 Kg.",
    });
  });

  it("muestra el error del server (400/413) y no muestra preview", async () => {
    const apiErr = new Error("El archivo excede 10MB") as Error & { status: number };
    apiErr.status = 413;
    mockImport.mockRejectedValue(apiErr);
    render(<PriceListImport />);

    const input = screen.getByLabelText("Archivo PDF (máx. 10MB)");
    fireEvent.change(input, {
      target: { files: [new File(["pdf"], "planilla.pdf", { type: "application/pdf" })] },
    });

    expect(await screen.findByTestId("error")).toHaveTextContent(
      "El archivo excede 10MB",
    );
    expect(screen.queryByText("2. Revisar matcheo")).not.toBeInTheDocument();
  });

  it("navega al detalle tras importar con éxito", async () => {
    render(<PriceListImport />);
    await uploadPdf();
    await confirmImport();
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/planilla-mayorista/pl-1"),
    );
  });
});

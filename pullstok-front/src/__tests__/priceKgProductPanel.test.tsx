import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import {
  PriceKgProductPanel,
  buildCellSaleItem,
} from "@/components/molecules/PriceKgProductPanel";
import { listProductsForCell } from "@/services/priceKgReview";

vi.mock("@/services/priceKgReview", () => ({
  listProductsForCell: vi.fn(),
}));

const listProductsForCellMock = vi.mocked(listProductsForCell);

const CELL = {
  brandId: "b-proplan",
  brandName: "PRO PLAN",
  typeId: "t-adulto",
  typeName: "Adulto",
  species: "PERRO" as const,
  priceKg: 9200,
};

const PRODUCTS = [
  {
    id: "p1",
    name: "PRO PLAN ADULTO PERRO 12KG",
    weightKg: 12,
    stock: 5,
    priceKgSuelto: 7500,
    category: "Alimento Seco Perro",
    exact: true,
  },
  {
    id: "p2",
    name: "PRO PLAN ADULTO PERRO 15KG",
    weightKg: 15,
    stock: 3,
    priceKgSuelto: 7500,
    category: "Alimento Seco Perro",
    exact: true,
  },
  {
    id: "p3",
    name: "PRO PLAN SENIOR PERRO 12KG",
    weightKg: 12,
    stock: 8,
    priceKgSuelto: 7000,
    category: "Alimento Seco Perro",
    exact: false,
  },
];

const renderPanel = (overrides: Partial<React.ComponentProps<typeof PriceKgProductPanel>> = {}) =>
  render(
    <PriceKgProductPanel
      open={true}
      onClose={vi.fn()}
      cell={CELL}
      onSellDirect={vi.fn()}
      onAddToCart={vi.fn()}
      onCreateProduct={vi.fn()}
      {...overrides}
    />,
  );

describe("PriceKgProductPanel — panel de venta suelta por celda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listProductsForCellMock.mockResolvedValue(PRODUCTS);
  });

  it("muestra marca, tipo, especie y precio de la celda, y carga los productos", async () => {
    renderPanel();

    expect(screen.getByText(/PRO PLAN/)).toBeInTheDocument();
    expect(screen.getByText(/Adulto/)).toBeInTheDocument();
    expect(screen.getByText("Perros")).toBeInTheDocument();

    await waitFor(() => {
      expect(listProductsForCellMock).toHaveBeenCalledWith({
        brandId: "b-proplan",
        typeId: "t-adulto",
        species: "PERRO",
      });
    });
    expect(await screen.findByText("PRO PLAN ADULTO PERRO 12KG")).toBeInTheDocument();
    expect(screen.getByText("PRO PLAN ADULTO PERRO 15KG")).toBeInTheDocument();
  });

  it("muestra el precio de la celda por kg (no el priceKgSuelto del producto)", async () => {
    renderPanel();
    // El header muestra $9.200/kg de la celda
    expect(await screen.findByText(/\$9\.200\/kg/)).toBeInTheDocument();
  });

  it("filtra por texto en el buscador (client-side)", async () => {
    renderPanel();
    await screen.findByText("PRO PLAN ADULTO PERRO 12KG");

    fireEvent.change(screen.getByPlaceholderText(/buscar/i), {
      target: { value: "15KG" },
    });

    expect(screen.queryByText("PRO PLAN ADULTO PERRO 12KG")).not.toBeInTheDocument();
    expect(screen.getByText("PRO PLAN ADULTO PERRO 15KG")).toBeInTheDocument();
  });

  it("pagina 10 productos por página con Pagination numbered", async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `p${i}`,
      name: `PRODUCTO ${i + 1}`,
      weightKg: 10,
      stock: 1,
      priceKgSuelto: 8000,
      category: "Alimento Seco Perro",
      exact: true,
    }));
    listProductsForCellMock.mockResolvedValue(many);
    renderPanel();

    await screen.findByText("PRODUCTO 1");
    expect(screen.getByText("PRODUCTO 10")).toBeInTheDocument();
    expect(screen.queryByText("PRODUCTO 11")).not.toBeInTheDocument();
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /siguiente|next/i }));
    expect(screen.getByText("PRODUCTO 11")).toBeInTheDocument();
  });

  it("POR_PESO: preview total = qty × precio de la celda", async () => {
    renderPanel();
    await screen.findByText("PRO PLAN ADULTO PERRO 12KG");

    fireEvent.click(screen.getByText("PRO PLAN ADULTO PERRO 12KG"));
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "2" },
    });

    // 2 kg × $9.200 (celda) = $18.400
    expect(screen.getByText(/\$18\.400/)).toBeInTheDocument();
  });

  it("POR_MONTO: input de monto con equivalencia en kg a precio de celda", async () => {
    renderPanel();
    await screen.findByText("PRO PLAN ADULTO PERRO 12KG");

    fireEvent.click(screen.getByText("PRO PLAN ADULTO PERRO 12KG"));
    fireEvent.click(screen.getByRole("button", { name: "Por monto" }));
    fireEvent.change(screen.getByLabelText("Monto ($)"), {
      target: { value: "9200" },
    });

    // $9.200 / $9.200/kg = 1.00 kg
    expect(screen.getByText("1.00 kg")).toBeInTheDocument();
  });

  it("'Vender directo' llama onSellDirect con el producto, cantidad, modo y monto", async () => {
    const onSellDirect = vi.fn();
    renderPanel({ onSellDirect });
    await screen.findByText("PRO PLAN ADULTO PERRO 12KG");

    fireEvent.click(screen.getByText("PRO PLAN ADULTO PERRO 12KG"));
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "2.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /vender directo/i }));

    expect(onSellDirect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1" }),
      2.5,
      "POR_PESO",
      0,
    );
  });

  it("'Agregar al pedido' llama onAddToCart", async () => {
    const onAddToCart = vi.fn();
    renderPanel({ onAddToCart });
    await screen.findByText("PRO PLAN ADULTO PERRO 12KG");

    fireEvent.click(screen.getByText("PRO PLAN ADULTO PERRO 12KG"));
    fireEvent.click(screen.getByRole("button", { name: /agregar al pedido/i }));

    expect(onAddToCart).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1" }),
      expect.any(Number),
      "POR_PESO",
      0,
    );
  });

  it("estado vacío: mensaje y botón 'Crear producto'", async () => {
    listProductsForCellMock.mockResolvedValue([]);
    const onCreateProduct = vi.fn();
    renderPanel({ onCreateProduct });

    expect(await screen.findByText(/sin productos/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /crear producto/i }));
    expect(onCreateProduct).toHaveBeenCalled();
  });

  it("celda sin precio: acciones deshabilitadas y aviso 'Sin precio en planilla'", async () => {
    renderPanel({
      cell: { ...CELL, priceKg: null },
    });

    expect(screen.getByText("Sin precio en planilla")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /vender directo/i })).toBeDisabled();
    expect(listProductsForCellMock).not.toHaveBeenCalled();
  });

  describe("buildCellSaleItem", () => {
    const product = {
      _id: "p1",
      id: "p1",
      name: "PRO PLAN ADULTO PERRO 12KG",
      priceKgSuelto: 7500,
    };

    it("usa el precio de la CELDA, no el priceKgSuelto del producto", () => {
      const item = buildCellSaleItem(product, 2, "POR_PESO", 0, 9200);
      expect(item.product.price).toBe(9200);
      expect(item.totalPrice).toBe(18400);
      expect(item.saleMode).toBe("POR_PESO");
      expect(item.quantity).toBe(2);
    });

    it("POR_MONTO: quantity = monto y totalPrice = monto", () => {
      const item = buildCellSaleItem(product, 0, "POR_MONTO", 4600, 9200);
      expect(item.quantity).toBe(4600);
      expect(item.totalPrice).toBe(4600);
      expect(item.product.price).toBe(9200);
    });
  });
});
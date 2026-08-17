import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
  PriceKgProductPanel,
  buildCellSaleItem,
} from "@/components/molecules/PriceKgProductPanel";
import { getLooseStock } from "@/services/looseStock";

vi.mock("@/services/looseStock", () => ({
  getLooseStock: vi.fn(),
}));

const getLooseStockMock = vi.mocked(getLooseStock);

const CELL = {
  brandId: "b-proplan",
  brandName: "PRO PLAN",
  typeId: "t-adulto",
  typeName: "Adulto",
  species: "PERRO" as const,
  priceKg: 9200,
  cellId: "c-proplan",
};

const LOOSE_LINE = {
  id: "ls-1",
  priceKgPriceId: "c-proplan",
  branchId: "b1",
  quantity: 15.5,
  lineName: "PRO PLAN · Adulto",
  branchName: "Sucursal 1",
};

const renderPanel = (overrides: Partial<React.ComponentProps<typeof PriceKgProductPanel>> = {}) =>
  render(
    <PriceKgProductPanel
      open={true}
      onClose={vi.fn()}
      cell={CELL}
      onSellDirect={vi.fn()}
      onAddToCart={vi.fn()}
      {...overrides}
    />,
  );

describe("PriceKgProductPanel — modal de venta suelta por celda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLooseStockMock.mockResolvedValue(LOOSE_LINE);
  });

  it("abre con la celda: nombre de línea, especie, precio de la celda y stock suelto", async () => {
    const { findByText } = renderPanel({ branchId: "b1" });

    // Título = nombre de la línea "MARCA · TIPO"; badge de especie.
    expect(await findByText("PRO PLAN · Adulto")).toBeInTheDocument();
    expect(screen.getByText("Perros")).toBeInTheDocument();
    // Precio autoritativo de la celda ($/kg), no priceKgSuelto de producto.
    // Se ve en el badge de cabecera y en la línea de precio del modo activo.
    expect((await screen.findAllByText(/\$9\.200\/kg/)).length).toBeGreaterThan(0);
    // Stock suelto de la sucursal cargado desde looseStock: se ve en el header
    // ("Stock suelto") y en la línea "Stock disponible" del modo activo.
    expect(getLooseStockMock).toHaveBeenCalledWith("c-proplan", "b1");
    expect((await screen.findAllByText("15.50 kg")).length).toBeGreaterThan(0);
    // Sin búsqueda ni lista de productos.
    expect(screen.queryByPlaceholderText(/buscar producto/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sin productos que matcheen/i)).not.toBeInTheDocument();
  });

  it("ofrece solo los modos sueltos: 'Por kilo' y 'Por monto'", async () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Por kilo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Por monto" })).toBeInTheDocument();
    // Sin modo bolsa cerrada en el panel de celda.
    expect(screen.queryByRole("button", { name: "Entero" })).not.toBeInTheDocument();
  });

  it("sin sucursal no consulta el stock suelto y muestra '—'", () => {
    renderPanel();
    expect(getLooseStockMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Stock suelto/)).toHaveTextContent("—");
  });

  it("POR_PESO: preview total = qty × precio de la celda", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "2" },
    });
    // 2 kg × $9.200 (celda) = $18.400,00 (linea inline + total sobre acciones)
    expect(screen.getAllByText("$18.400,00").length).toBeGreaterThan(0);
  });

  it("POR_MONTO: input de monto con equivalencia en kg a precio de celda", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Por monto" }));
    fireEvent.change(screen.getByLabelText("Monto ($)"), {
      target: { value: "9200" },
    });
    // $9.200 / $9.200/kg = 1.00 kg
    expect(await screen.findByText("1.00 kg")).toBeInTheDocument();
  });

  it("'Vender directo' llama onSellDirect(qty, modo, monto)", () => {
    const onSellDirect = vi.fn();
    renderPanel({ onSellDirect });
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "2.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /vender directo/i }));
    expect(onSellDirect).toHaveBeenCalledWith(2.5, "POR_PESO", 0);
  });

  it("'Vender directo' en modo monto manda qty 0 y el monto", async () => {
    const onSellDirect = vi.fn();
    renderPanel({ onSellDirect });
    fireEvent.click(screen.getByRole("button", { name: "Por monto" }));
    fireEvent.change(screen.getByLabelText("Monto ($)"), {
      target: { value: "4600" },
    });
    fireEvent.click(screen.getByRole("button", { name: /vender directo/i }));
    expect(onSellDirect).toHaveBeenCalledWith(0, "POR_MONTO", 4600);
  });

  it("'Agregar al pedido' llama onAddToCart(qty, modo, monto)", () => {
    const onAddToCart = vi.fn();
    renderPanel({ onAddToCart });
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "1.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /agregar al pedido/i }));
    expect(onAddToCart).toHaveBeenCalledWith(1.5, "POR_PESO", 0);
  });

  it("celda sin precio: aviso 'Sin precio en planilla' y acciones deshabilitadas", () => {
    renderPanel({ cell: { ...CELL, priceKg: null } });
    expect(screen.getByText("Sin precio en planilla")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /vender directo/i })).toBeDisabled();
    expect(getLooseStockMock).not.toHaveBeenCalled();
  });

  it("stock suelto en 0 con sucursal: aviso + vender deshabilitado", async () => {
    getLooseStockMock.mockResolvedValue({ ...LOOSE_LINE, quantity: 0 });
    renderPanel({ branchId: "b1" });
    expect(
      await screen.findByText("Sin stock suelto cargado"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "2" },
    });
    // El backend rechazaría (stock suelto insuficiente) → se bloquea antes.
    expect(
      screen.getByRole("button", { name: /vender directo/i }),
    ).toBeDisabled();
  });

  describe("buildCellSaleItem", () => {
    const cell = {
      priceKg: 9200,
      cellId: "c-proplan",
      brandName: "PRO PLAN",
      typeName: "Adulto",
    };

    it("usa el precio de la CELDA y arma la línea con loosePriceId/looseName", () => {
      const item = buildCellSaleItem(cell, 2, "POR_PESO", 0);
      expect(item.product.price).toBe(9200);
      expect(item.product.name).toBe("PRO PLAN · Adulto");
      expect(item.totalPrice).toBe(18400);
      expect(item.saleMode).toBe("POR_PESO");
      expect(item.quantity).toBe(2);
      expect(item.loosePriceId).toBe("c-proplan");
      expect(item.looseName).toBe("PRO PLAN · Adulto");
    });

    it("POR_MONTO: quantity = monto y totalPrice = monto", () => {
      const item = buildCellSaleItem(cell, 0, "POR_MONTO", 4600);
      expect(item.quantity).toBe(4600);
      expect(item.totalPrice).toBe(4600);
      expect(item.product.price).toBe(9200);
      expect(item.loosePriceId).toBe("c-proplan");
    });

    it("sin id de celda NO incluye loosePriceId y usa productId vacío", () => {
      const item = buildCellSaleItem(
        { priceKg: null, cellId: null, brandName: "", typeName: "" },
        2,
        "POR_PESO",
        0,
      );
      expect(item.loosePriceId).toBeUndefined();
      expect(item.looseName).toBeUndefined();
      expect(item.product._id).toBe("");
      expect(item.product.price).toBe(0);
    });
  });
});
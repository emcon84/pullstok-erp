import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { saleItemQuantityLabel } from "../models/saleModeHelpers";
import { DocTable } from "../components/molecules/DocTable";

// Listado de ventas: la línea libre (POR_PESO sin producto ni celda) se muestra
// en gramos ("350 g"); el resto de las líneas conserva su cantidad numérica.
describe("saleItemQuantityLabel", () => {
  it("línea libre → gramos", () => {
    expect(
      saleItemQuantityLabel({ saleMode: "POR_PESO", productId: null, loosePriceId: null, quantity: 0.35 }),
    ).toBe("350 g");
  });

  it("línea suelta de celda o de producto → sin etiqueta especial", () => {
    expect(saleItemQuantityLabel({ saleMode: "POR_PESO", loosePriceId: "c1", quantity: 0.35 })).toBeUndefined();
    expect(saleItemQuantityLabel({ saleMode: "BOLSA_CERRADA", productId: "p1", quantity: 2 })).toBeUndefined();
  });
});

describe("DocTable — quantityLabel", () => {
  it("renderiza la etiqueta en lugar de la cantidad cruda", () => {
    render(
      <DocTable
        items={[{ quantity: 0.35, quantityLabel: "350 g", name: "Hueso molido", price: 8000 }]}
      />,
    );
    expect(screen.getAllByText("350 g").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("0.35")).not.toBeInTheDocument();
  });
});

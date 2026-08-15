import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { QuantityModal } from "@/components/molecules/QuantityModal";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Producto suelto (priceKgSuelto > 0) para que el switch de modos aparezca.
const looseProduct = {
  _id: "p1",
  name: "PRO PLAN ADULTO PERRO 12KG",
  price: 85000,
  priceKgSuelto: 9200,
  weightKg: 12,
  quantity: 100,
};

const renderModal = (overrides: Partial<React.ComponentProps<typeof QuantityModal>> = {}) =>
  render(
    <QuantityModal
      product={looseProduct}
      qty={1}
      setQty={vi.fn()}
      maxStock={50}
      directSelling={false}
      saleMode="POR_PESO"
      setSaleMode={vi.fn()}
      amount={0}
      setAmount={vi.fn()}
      onDirectSale={vi.fn()}
      onAddToCart={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  );

describe("QuantityModal — modos de venta suelto (sdd/precios-suelto-planilla C-06)", () => {
  it("muestra las etiquetas Entero / Por kilo / Por monto", () => {
    renderModal();

    expect(screen.getByRole("button", { name: "Entero" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Por kilo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Por monto" })).toBeInTheDocument();
  });

  it("marca el modo activo con aria-pressed", () => {
    renderModal({ saleMode: "POR_PESO" });

    expect(screen.getByRole("button", { name: "Por kilo" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Entero" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("cambia el modo activo al hacer click en otro botón", () => {
    const setSaleMode = vi.fn();
    renderModal({ saleMode: "POR_PESO", setSaleMode });

    fireEvent.click(screen.getByRole("button", { name: "Por monto" }));

    expect(setSaleMode).toHaveBeenCalledWith("POR_MONTO");
  });
});
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocTable } from "@/components/molecules/DocTable";

/**
 * DocTable: shared items table for Orders/Quotations/Sales cards.
 * Desktop (sm+) renders the classic columns; mobile stacks each item with
 * in-node labels (Cant./P. unit./Total) so long amounts are never cut.
 */
const items = [
  { quantity: 2, name: "Collar de Cuero", price: 1500 },
  { quantity: 1, name: "Aros Plata 925", price: 3200.5 },
];

describe("DocTable — desktop/mobile responsive layout", () => {
  it("apila cantidad y total con etiqueta en mobile", () => {
    render(<DocTable items={items} />);
    expect(screen.getByText(/Cant\.: 2/)).toBeInTheDocument();
    expect(screen.getByText(/Total: \$3\.000/)).toBeInTheDocument();
  });

  it("muestra precio unitario con su etiqueta cuando showUnitPrice", () => {
    render(<DocTable items={items} showUnitPrice />);
    expect(screen.getByText(/P\. unit\.: \$1\.500/)).toBeInTheDocument();
    expect(screen.getByText(/P\. unit\.: \$3\.200,5/)).toBeInTheDocument();
  });

  it("no muestra precio unitario sin showUnitPrice (carrito)", () => {
    render(<DocTable items={items} />);
    expect(screen.queryByText(/P\. unit\./)).not.toBeInTheDocument();
  });

it("renderiza cantidad, nombre y total por fila", () => {
    render(<DocTable items={items} showUnitPrice />);
    // El nombre figura dos veces: rama mobile y rama desktop.
    expect(screen.getAllByText("Collar de Cuero").length).toBeGreaterThan(0);
    // Total de la fila 2 (1500 * 2).
    expect(screen.getByText(/Total: \$3\.000/)).toBeInTheDocument();
  });

  it("onRemove dispara el borrado con el índice correcto", () => {
    const onRemove = vi.fn();
    render(<DocTable items={items} onRemove={onRemove} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Quitar Collar de Cuero" }),
    );
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScannedProductDialog } from "@/components/molecules/ScannedProductDialog";
import type { DataItem } from "@/types";

const product = {
  id: "p1",
  name: "Royal Canin Mini Adult 3kg",
  price: 12500,
  code: "RC-001",
  barcode: "7790001234567",
  image: "https://cdn.test/rc.png",
  quantity: 7,
} as unknown as DataItem;

describe("ScannedProductDialog", () => {
  it("muestra nombre, código, código de barras, precio, stock e imagen", () => {
    render(<ScannedProductDialog product={product} open onClose={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText("Royal Canin Mini Adult 3kg")).toBeInTheDocument();
    expect(screen.getByText("RC-001")).toBeInTheDocument();
    expect(screen.getByText("7790001234567")).toBeInTheDocument();
    expect(screen.getByText(/12\.500/)).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://cdn.test/rc.png");
  });

  it("omite stock, código y barcode cuando no hay datos", () => {
    const bare = { id: "p2", name: "Sin datos", price: 100 } as unknown as DataItem;
    render(<ScannedProductDialog product={bare} open onClose={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.queryByText(/Stock/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Código/)).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("Cerrar llama onClose", () => {
    const onClose = vi.fn();
    render(<ScannedProductDialog product={product} open onClose={onClose} onEdit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Editar llama onEdit con el producto y tiene el foco inicial", () => {
    const onEdit = vi.fn();
    render(<ScannedProductDialog product={product} open onClose={vi.fn()} onEdit={onEdit} />);
    const edit = screen.getByRole("button", { name: /Editar/ });
    expect(edit).toHaveFocus();
    fireEvent.click(edit);
    expect(onEdit).toHaveBeenCalledWith(product);
  });

  it("no renderiza nada con open=false o sin producto", () => {
    const { rerender } = render(
      <ScannedProductDialog product={product} open={false} onClose={vi.fn()} onEdit={vi.fn()} />,
    );
    expect(screen.queryByText("Royal Canin Mini Adult 3kg")).not.toBeInTheDocument();
    rerender(<ScannedProductDialog product={null} open onClose={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });
});

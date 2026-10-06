import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductSelector } from "@/components/molecules/ProductSelector";
import type { ProductsProps } from "@/models/productsModel";

const products = [
  { _id: "p1", name: "Royal Canin 15kg", price: 1000, quantity: 3, image: "/a.png" },
  { _id: "p2", name: "Cat Chow", price: 500, quantity: 1 },
] as unknown as ProductsProps[];

const base = { open: true, onOpenChange: vi.fn(), onConfirm: vi.fn(), products };

describe("ProductSelector — server-side pagination", () => {
  it("shows 'Ver más resultados' in server mode when hasMore and calls onLoadMore", () => {
    const onLoadMore = vi.fn();
    render(
      <ProductSelector {...base} onSearch={vi.fn()} hasMore onLoadMore={onLoadMore} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver más resultados" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("hides the button when there are no more results", () => {
    render(<ProductSelector {...base} onSearch={vi.fn()} hasMore={false} onLoadMore={vi.fn()} />);
    expect(screen.queryByText("Ver más resultados")).not.toBeInTheDocument();
  });

  it("disables the button and shows a loading label while loadingMore", () => {
    render(
      <ProductSelector {...base} onSearch={vi.fn()} hasMore onLoadMore={vi.fn()} loadingMore />,
    );
    const btn = screen.getByRole("button", { name: /Cargando/ });
    expect(btn).toBeDisabled();
    expect(screen.queryByText("Ver más resultados")).not.toBeInTheDocument();
  });

  it("legacy client-side mode (no onSearch) never shows the button", () => {
    render(<ProductSelector {...base} hasMore onLoadMore={vi.fn()} />);
    expect(screen.queryByText("Ver más resultados")).not.toBeInTheDocument();
  });

  it("legacy mode still filters client-side", () => {
    render(<ProductSelector {...base} />);
    fireEvent.change(screen.getByPlaceholderText("Buscar productos..."), {
      target: { value: "chow" },
    });
    expect(screen.getByText("Cat Chow")).toBeInTheDocument();
    expect(screen.queryByText("Royal Canin 15kg")).not.toBeInTheDocument();
  });

  it("product images load lazily and decode async", () => {
    render(<ProductSelector {...base} />);
    const img = screen.getByAltText("Royal Canin 15kg");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });
});

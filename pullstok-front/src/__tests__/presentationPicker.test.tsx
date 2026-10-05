import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PresentationPicker } from "../components/molecules/PresentationPicker";
import type { DataItem } from "../types";

const product = {
  id: "p1",
  name: "Ibuprofeno",
  price: 900,
  hasPresentations: true,
  presentations: [
    { id: "c", name: "Caja", factor: 100, price: 900, wholesalePrice: 700, sortOrder: 0 },
    { id: "b", name: "Blister", factor: 10, price: 150, wholesalePrice: null, sortOrder: 1 },
    { id: "p", name: "Pastilla", factor: 1, price: 0, wholesalePrice: null, sortOrder: 2 },
  ],
} as DataItem;

const setup = (props: Partial<React.ComponentProps<typeof PresentationPicker>> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <PresentationPicker
      product={product}
      sellsWholesale={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel, list: screen.getByRole("listbox") };
};

describe("PresentationPicker", () => {
  it("hides price-0 presentations", () => {
    setup();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.queryByText("Pastilla")).toBeNull();
  });

  it("preselects the largest factor and confirms it with Enter", () => {
    const { onConfirm, list } = setup();
    expect(screen.getByRole("option", { name: /Caja/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }));
  });

  it("moves with the arrow keys and confirms the active option", () => {
    const { onConfirm, list } = setup();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Blister/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(list, { key: "ArrowDown" }); // stays on the last
    fireEvent.keyDown(list, { key: "ArrowUp" });
    fireEvent.keyDown(list, { key: "ArrowUp" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("click chooses an option", () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole("option", { name: /Blister/ }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("Escape cancels", () => {
    const { onCancel } = setup();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows price (wholesale-aware) and a content hint", () => {
    setup({ sellsWholesale: true });
    expect(screen.getByRole("option", { name: /Caja/ })).toHaveTextContent("$700");
    expect(screen.getByRole("option", { name: /Blister/ })).toHaveTextContent("$150");
    expect(screen.getByRole("option", { name: /Blister/ })).toHaveTextContent("10 pastillas");
  });

  it("shows a hint when the base presentation is sellable", () => {
    const withBase = {
      ...product,
      presentations: product.presentations!.map((x) => (x.id === "p" ? { ...x, price: 20 } : x)),
    } as DataItem;
    setup({ product: withBase });
    expect(screen.getByRole("option", { name: /Blister/ })).toHaveTextContent("10 pastillas");
  });

  it("disables options when known base stock is short and skips factor 0", () => {
    const pending = {
      ...product,
      presentations: [
        ...product.presentations!,
        { id: "x", name: "Pack", factor: 0, price: 50, wholesalePrice: null, sortOrder: 3 },
      ],
    } as DataItem;
    const { onConfirm, list } = setup({ product: pending, stock: 25 });
    const caja = screen.getByRole("option", { name: /Caja/ });
    expect(caja).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: /Pack/ })).not.toHaveAttribute("aria-disabled", "true");
    // preselection falls to the first enabled option; disabled click is ignored
    expect(screen.getByRole("option", { name: /Blister/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(caja);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(list).toBeInTheDocument();
  });

  it("shows stock levels when stock is known", () => {
    setup({ stock: 125 });
    expect(screen.getByText(/1 Caja · 2 Blister/)).toBeInTheDocument();
  });
});

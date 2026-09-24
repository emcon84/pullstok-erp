import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CartItemRow, stepQty } from "../components/molecules/CartItemRow";
import type { VendorCartItem } from "../components/hooks/useVendorCart";

const makeItem = (over: Partial<VendorCartItem> = {}): VendorCartItem => ({
  productId: "p1",
  name: "AGILITY · Adulto",
  code: "",
  price: 8000,
  stock: 0,
  quantity: 1,
  branchId: "b1",
  saleMode: "POR_PESO",
  loosePriceId: "cell1",
  ...over,
});

describe("stepQty", () => {
  it("POR_PESO steps by 1 kg and never drops below 0.01", () => {
    expect(stepQty(makeItem({ quantity: 1 }), 1)).toBe(2);
    expect(stepQty(makeItem({ quantity: 2.5 }), -1)).toBe(1.5);
    expect(stepQty(makeItem({ quantity: 0.5 }), -1)).toBe(0.01);
  });

  it("POR_MONTO does not step (amount is typed)", () => {
    expect(stepQty(makeItem({ saleMode: "POR_MONTO", quantity: 3000 }), 1)).toBe(3000);
    expect(stepQty(makeItem({ saleMode: "POR_MONTO", quantity: 3000 }), -1)).toBe(3000);
  });

  it("BOLSA_CERRADA keeps integer steps with a floor of 1", () => {
    const bag = makeItem({ saleMode: "BOLSA_CERRADA", quantity: 1, stock: 5 });
    expect(stepQty(bag, 1)).toBe(2);
    expect(stepQty(bag, -1)).toBe(1);
  });
});

describe("CartItemRow — loose lines", () => {
  it("keeps + enabled for POR_PESO even though cart stock is 0", () => {
    render(<CartItemRow item={makeItem()} onUpdateQty={vi.fn()} onRemove={vi.fn()} />);
    const plus = screen.getByRole("button", { name: "Aumentar" });
    expect((plus as HTMLButtonElement).disabled).toBe(false);
  });

  it("calls onUpdateQty with the next kg when + is clicked", () => {
    const onUpdateQty = vi.fn();
    render(<CartItemRow item={makeItem()} onUpdateQty={onUpdateQty} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Aumentar" }));
    expect(onUpdateQty).toHaveBeenCalledWith(2);
  });

  it("hides −/+ for POR_MONTO", () => {
    render(
      <CartItemRow
        item={makeItem({ saleMode: "POR_MONTO", price: 1, quantity: 3000 })}
        onUpdateQty={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Aumentar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disminuir" })).toBeNull();
  });

  it("commits a typed quantity on Enter (comma decimal accepted)", () => {
    const onUpdateQty = vi.fn();
    render(<CartItemRow item={makeItem()} onUpdateQty={onUpdateQty} onRemove={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Cantidad" });
    fireEvent.change(input, { target: { value: "2,5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onUpdateQty).toHaveBeenCalledWith(2.5);
  });

  it("commits a typed amount on blur for POR_MONTO", () => {
    const onUpdateQty = vi.fn();
    render(
      <CartItemRow
        item={makeItem({ saleMode: "POR_MONTO", price: 1, quantity: 3000 })}
        onUpdateQty={onUpdateQty}
        onRemove={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Cantidad" });
    fireEvent.change(input, { target: { value: "4500" } });
    fireEvent.blur(input);
    expect(onUpdateQty).toHaveBeenCalledWith(4500);
  });

  it("ignores invalid input and restores the current quantity", () => {
    const onUpdateQty = vi.fn();
    render(<CartItemRow item={makeItem()} onUpdateQty={onUpdateQty} onRemove={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Cantidad" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    expect(onUpdateQty).not.toHaveBeenCalled();
    expect(input.value).toBe("1.00");
  });
});

describe("CartItemRow — closed bags", () => {
  it("still disables + at the stock limit", () => {
    render(
      <CartItemRow
        item={makeItem({ saleMode: "BOLSA_CERRADA", quantity: 3, stock: 3 })}
        onUpdateQty={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const plus = screen.getByRole("button", { name: "Aumentar" });
    expect((plus as HTMLButtonElement).disabled).toBe(true);
  });
});

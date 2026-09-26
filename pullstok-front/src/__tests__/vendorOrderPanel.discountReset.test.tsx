import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/components/molecules/PaymentModal", () => ({
  PaymentModal: () => null,
}));
vi.mock("@/components/molecules/CartItemRow", () => ({
  CartItemRow: () => <div data-testid="cart-row" />,
  stepQty: vi.fn(),
}));

import { VendorOrderPanel } from "@/components/molecules/VendorOrderPanel";

const item = { productId: "p1", name: "Item", price: 100, quantity: 1 };

function makeCart(items: unknown[]) {
  return {
    items,
    totalAmount: items.length * 100,
    itemCount: items.length,
    clearCart: vi.fn(),
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
  } as never;
}

function panel(items: unknown[]) {
  return (
    <VendorOrderPanel
      cart={makeCart(items)}
      status={{ confirming: false, savingOrder: false }}
      saveOrder={vi.fn()}
      confirmSale={vi.fn()}
      open={false}
      onOpenChange={vi.fn()}
    />
  );
}

describe("VendorOrderPanel discount", () => {
  it("resets the discount once the cart is emptied (sale confirmed)", () => {
    const { rerender } = render(panel([item]));
    const input = () => screen.getByLabelText("Descuento (%)") as HTMLInputElement;

    fireEvent.change(input(), { target: { value: "15" } });
    expect(input().value).toBe("15");

    // Sale confirmed → cart cleared.
    rerender(panel([]));
    // Next sale starts with a new cart.
    rerender(panel([item]));

    expect(input().value).toBe("0");
  });

  it("keeps the discount while the cart still has items", () => {
    const { rerender } = render(panel([item]));
    const input = () => screen.getByLabelText("Descuento (%)") as HTMLInputElement;

    fireEvent.change(input(), { target: { value: "15" } });
    rerender(panel([item, { ...item, productId: "p2" }]));

    expect(input().value).toBe("15");
  });
});

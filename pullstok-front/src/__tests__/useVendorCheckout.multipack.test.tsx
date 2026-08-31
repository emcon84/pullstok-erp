import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useVendorCheckout } from "../components/hooks/useVendorCheckout";
import { useCreateSale } from "../components/hooks/useSales";
import { useCreateOrder } from "../components/hooks/useOrder";
import type { VendorCartItem } from "../components/hooks/useVendorCart";

// sdd/venta-por-unidad-multpack — al confirmar una línea POR_UNIDAD el
// checkout manda un CartItem con saleMode=POR_UNIDAD y product.price=
// perUnitPrice (no el precio de caja).
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../components/hooks/useSales", () => ({ useCreateSale: vi.fn() }));
vi.mock("../components/hooks/useOrder", () => ({ useCreateOrder: vi.fn() }));

const mockUseCreateSale = vi.mocked(useCreateSale);
const mockUseCreateOrder = vi.mocked(useCreateOrder);

const unitItem: VendorCartItem = {
  productId: "p-multipack",
  name: "FELIX POUCH PESC X 15x85grs",
  code: "F-15",
  // price lleva el precio de CAJA (no normalizado): el checkout de una línea
  // POR_UNIDAD debe usar perUnitPrice, no i.price.
  price: 18400,
  perUnitPrice: 1226.67,
  unitsPerBox: 15,
  stock: 150,
  quantity: 3,
  branchId: "b1",
  saleMode: "POR_UNIDAD",
};

const boxItem: VendorCartItem = {
  productId: "p-multipack",
  name: "FELIX POUCH PESC X 15x85grs",
  code: "F-15",
  price: 18400,
  perUnitPrice: 1226.67,
  unitsPerBox: 15,
  stock: 150,
  quantity: 1,
  branchId: "b1",
  saleMode: "BOLSA_CERRADA",
};

describe("useVendorCheckout — payload de línea por unidad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateSale.mockReturnValue({
      createSale: vi.fn().mockResolvedValue({}),
    } as never);
    mockUseCreateOrder.mockReturnValue({
      submitOrder: vi.fn(),
      loading: false,
    } as never);
  });

  it("unit line → CartItem with saleMode=POR_UNIDAD and product.price=perUnitPrice", async () => {
    const createSale = vi.fn().mockResolvedValue({});
    mockUseCreateSale.mockReturnValue({ createSale } as never);
    const { result } = renderHook(() =>
      useVendorCheckout({
        branchId: "b1",
        cartItems: [unitItem],
        clearCart: vi.fn(),
        totalAmount: 3 * 1226.67,
      }),
    );

    await act(async () => {
      await result.current.handleConfirmSale();
    });

    await waitFor(() => expect(createSale).toHaveBeenCalled());
    const payload = createSale.mock.calls[0][0];
    expect(payload.cart).toHaveLength(1);
    expect(payload.cart[0].saleMode).toBe("POR_UNIDAD");
    expect(payload.cart[0].quantity).toBe(3);
    expect(payload.cart[0].product.price).toBeCloseTo(1226.67, 2);
    expect(payload.cart[0].totalPrice).toBeCloseTo(3 * 1226.67, 2);
  });

  it("box line keeps product.price (not perUnitPrice) in the payload", async () => {
    const createSale = vi.fn().mockResolvedValue({});
    mockUseCreateSale.mockReturnValue({ createSale } as never);
    const { result } = renderHook(() =>
      useVendorCheckout({
        branchId: "b1",
        cartItems: [boxItem],
        clearCart: vi.fn(),
        totalAmount: 18400,
      }),
    );

    await act(async () => {
      await result.current.handleConfirmSale();
    });

    await waitFor(() => expect(createSale).toHaveBeenCalled());
    const payload = createSale.mock.calls[0][0];
    expect(payload.cart[0].saleMode).toBe("BOLSA_CERRADA");
    expect(payload.cart[0].product.price).toBe(18400);
  });

  it("POR_MONTO still uses priceKgSuelto for the price (C-05 unchanged)", async () => {
    const createSale = vi.fn().mockResolvedValue({});
    mockUseCreateSale.mockReturnValue({ createSale } as never);
    const looseItem: VendorCartItem = {
      ...boxItem,
      saleMode: "POR_MONTO",
      price: 1,
      priceKgSuelto: 950,
    };
    const { result } = renderHook(() =>
      useVendorCheckout({
        branchId: "b1",
        cartItems: [looseItem],
        clearCart: vi.fn(),
        totalAmount: 950,
      }),
    );

    await act(async () => {
      await result.current.handleConfirmSale();
    });

    await waitFor(() => expect(createSale).toHaveBeenCalled());
    const payload = createSale.mock.calls[0][0];
    expect(payload.cart[0].saleMode).toBe("POR_MONTO");
    expect(payload.cart[0].product.price).toBe(950);
  });
});

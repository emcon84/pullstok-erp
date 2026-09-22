import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useVendorCheckout } from "../components/hooks/useVendorCheckout";
import { useCreateSale } from "../components/hooks/useSales";
import { useCreateOrder } from "../components/hooks/useOrder";
import type { VendorCartItem } from "../components/hooks/useVendorCart";

// sdd/venta-pastillas-sueltas-blister — al confirmar una línea
// POR_UNIDAD_BLISTER el checkout debe mandar un CartItem con
// saleMode=POR_UNIDAD_BLISTER, product.price = el precio por pastilla ya
// resuelto en el carrito (item.price, sin necesidad de perUnitPrice), y
// piecesPerBlister (el server lo exige para recomputar el precio, T1/T2).
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../components/hooks/useSales", () => ({ useCreateSale: vi.fn() }));
vi.mock("../components/hooks/useOrder", () => ({ useCreateOrder: vi.fn() }));

const mockUseCreateSale = vi.mocked(useCreateSale);
const mockUseCreateOrder = vi.mocked(useCreateOrder);

const blisterItem: VendorCartItem = {
  productId: "p-blister",
  name: "IBUPROFENO 400 X BLISTER",
  code: "F-1",
  price: 700, // ya resuelto en el carrito: ceil(4500/7 a $100)
  stock: 20,
  quantity: 4, // 4 pastillas
  branchId: "b1",
  saleMode: "POR_UNIDAD_BLISTER",
  piecesPerBlister: 7,
};

describe("useVendorCheckout — payload de línea de pastillas sueltas de blister", () => {
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

  it("blister line → CartItem with saleMode=POR_UNIDAD_BLISTER, product.price=item.price and piecesPerBlister", async () => {
    const createSale = vi.fn().mockResolvedValue({});
    mockUseCreateSale.mockReturnValue({ createSale } as never);
    const { result } = renderHook(() =>
      useVendorCheckout({
        branchId: "b1",
        cartItems: [blisterItem],
        clearCart: vi.fn(),
        totalAmount: 4 * 700,
      }),
    );

    await act(async () => {
      await result.current.handleConfirmSale();
    });

    await waitFor(() => expect(createSale).toHaveBeenCalled());
    const payload = createSale.mock.calls[0][0];
    expect(payload.cart).toHaveLength(1);
    const line = payload.cart[0];
    expect(line.saleMode).toBe("POR_UNIDAD_BLISTER");
    expect(line.product.price).toBe(700);
    expect(line.quantity).toBe(4);
    expect(line.totalPrice).toBe(2800);
    expect(line.piecesPerBlister).toBe(7);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useVendorCheckout } from "../components/hooks/useVendorCheckout";
import { useCreateSale } from "../components/hooks/useSales";
import { useCreateOrder } from "../components/hooks/useOrder";
import type { VendorCartItem } from "../components/hooks/useVendorCart";

// Venta libre: al confirmar, el checkout manda un CartItem con freeLine +
// lineTotal exacto; "Guardar pedido" las rechaza (un Order exige productId).
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("../components/hooks/useSales", () => ({ useCreateSale: vi.fn() }));
vi.mock("../components/hooks/useOrder", () => ({ useCreateOrder: vi.fn() }));

import { toast } from "react-toastify";

const freeItem: VendorCartItem = {
  productId: "free-abc",
  name: "Hueso molido",
  code: "",
  price: 2800 / 0.35,
  stock: 0,
  quantity: 0.35,
  branchId: "b1",
  saleMode: "POR_PESO",
  isFreeLine: true,
  lineTotal: 2800,
};

describe("useVendorCheckout — venta libre", () => {
  const submitOrder = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCreateOrder).mockReturnValue({ submitOrder, loading: false } as never);
  });

  it("handleConfirmSale → CartItem con freeLine, lineTotal y SIN loosePriceId", async () => {
    const createSale = vi.fn().mockResolvedValue({});
    vi.mocked(useCreateSale).mockReturnValue({ createSale } as never);
    const { result } = renderHook(() =>
      useVendorCheckout({ branchId: "b1", cartItems: [freeItem], clearCart: vi.fn(), totalAmount: 2800 }),
    );

    await act(async () => {
      await result.current.handleConfirmSale();
    });

    await waitFor(() => expect(createSale).toHaveBeenCalled());
    const line = createSale.mock.calls[0][0].cart[0];
    expect(line.freeLine).toBe(true);
    expect(line.lineTotal).toBe(2800);
    expect(line.saleMode).toBe("POR_PESO");
    expect(line.quantity).toBe(0.35);
    expect(line.loosePriceId).toBeUndefined();
    expect(line.product.name).toBe("Hueso molido");
  });

  it("el ticket de la venta muestra la línea libre en gramos", async () => {
    vi.mocked(useCreateSale).mockReturnValue({ createSale: vi.fn().mockResolvedValue({}) } as never);
    const { result } = renderHook(() =>
      useVendorCheckout({ branchId: "b1", cartItems: [freeItem], clearCart: vi.fn(), totalAmount: 2800 }),
    );
    await act(async () => {
      await result.current.handleConfirmSale();
    });
    await waitFor(() => expect(result.current.pendingTicket).not.toBeNull());
    expect(result.current.pendingTicket!.lines[0].detail).toBe("350 g");
  });

  it("handleSaveOrder rechaza el pedido si hay una línea libre (no se puede guardar en un Order)", () => {
    vi.mocked(useCreateSale).mockReturnValue({ createSale: vi.fn() } as never);
    const { result } = renderHook(() =>
      useVendorCheckout({ branchId: "b1", cartItems: [freeItem], clearCart: vi.fn(), totalAmount: 2800 }),
    );
    act(() => result.current.handleSaveOrder());
    expect(submitOrder).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/venta libre/i));
  });
});

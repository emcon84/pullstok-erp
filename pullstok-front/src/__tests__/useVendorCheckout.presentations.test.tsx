import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { toast } from "react-toastify";
import { useVendorCheckout } from "../components/hooks/useVendorCheckout";
import { useCreateSale } from "../components/hooks/useSales";
import { useCreateOrder } from "../components/hooks/useOrder";
import type { VendorCartItem } from "../components/hooks/useVendorCart";

vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../components/hooks/useSales", () => ({ useCreateSale: vi.fn() }));
vi.mock("../components/hooks/useOrder", () => ({ useCreateOrder: vi.fn() }));

const item: VendorCartItem = {
  productId: "p1",
  name: "Ibuprofeno (Blister)",
  code: "F-1",
  price: 150,
  stock: 25,
  quantity: 2,
  branchId: "b1",
  saleMode: "BOLSA_CERRADA",
  presentationId: "b",
  presentationName: "Blister",
  presentationFactor: 10,
};

const setup = (sale: ReturnType<typeof vi.fn>, submitOrder = vi.fn()) => {
  vi.mocked(useCreateSale).mockReturnValue({ createSale: sale } as never);
  vi.mocked(useCreateOrder).mockReturnValue({ submitOrder, loading: false } as never);
  return renderHook(() =>
    useVendorCheckout({ branchId: "b1", cartItems: [item], clearCart: vi.fn(), totalAmount: 300 }),
  );
};

describe("useVendorCheckout presentations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends presentationId with saleMode BOLSA_CERRADA", async () => {
    const sale = vi.fn().mockResolvedValue({});
    const { result } = setup(sale);
    await act(async () => {
      await result.current.handleConfirmSale();
    });
    await waitFor(() => expect(sale).toHaveBeenCalled());
    const line = sale.mock.calls[0][0].cart[0];
    expect(line).toMatchObject({ saleMode: "BOLSA_CERRADA", presentationId: "b", presentationName: "Blister", quantity: 2, totalPrice: 300 });
  });

  it("maps server error codes to Spanish toasts and keeps the cart", async () => {
    const sale = vi.fn().mockRejectedValue({ code: "PRESENTATION_NOT_SELLABLE", message: "raw" });
    const { result } = setup(sale);
    await act(async () => {
      await result.current.handleConfirmSale();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/sin precio/i));
  });

  it("refuses to save a cart with presentations as a pending order", () => {
    const submitOrder = vi.fn();
    const { result } = setup(vi.fn(), submitOrder);
    act(() => result.current.handleSaveOrder());
    expect(submitOrder).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/presentaciones/i));
  });
});

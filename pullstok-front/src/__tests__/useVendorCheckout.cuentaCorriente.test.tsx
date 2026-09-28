import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { toast } from "react-toastify";
import { useVendorCheckout } from "../components/hooks/useVendorCheckout";
import { useCreateSale } from "../components/hooks/useSales";
import { useCreateOrder } from "../components/hooks/useOrder";
import type { VendorCartItem } from "../components/hooks/useVendorCart";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../components/hooks/useSales", () => ({ useCreateSale: vi.fn() }));
vi.mock("../components/hooks/useOrder", () => ({ useCreateOrder: vi.fn() }));

const mockUseCreateSale = vi.mocked(useCreateSale);
const mockUseCreateOrder = vi.mocked(useCreateOrder);

const item: VendorCartItem = {
  productId: "p1",
  name: "Royal Canin 15kg",
  code: "R15",
  price: 1000,
  stock: 10,
  quantity: 1,
  branchId: "b1",
  saleMode: "BOLSA_CERRADA",
};

const payments = [
  { method: "EFECTIVO" as const, amount: 600 },
  { method: "CUENTA_CORRIENTE" as const, amount: 400 },
];

function setup(createSaleAsync: ReturnType<typeof vi.fn>, clearCart = vi.fn()) {
  mockUseCreateSale.mockReturnValue({ createSale: vi.fn(), createSaleAsync } as never);
  const hook = renderHook(() =>
    useVendorCheckout({
      branchId: "b1",
      cartItems: [item],
      clearCart,
      totalAmount: 1000,
    }),
  );
  return { ...hook, clearCart };
}

describe("useVendorCheckout — cuenta corriente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateOrder.mockReturnValue({ submitOrder: vi.fn(), loading: false } as never);
  });

  it("forwards customerId to createSale", async () => {
    const createSaleAsync = vi.fn().mockResolvedValue(undefined);
    const { result } = setup(createSaleAsync);

    await act(async () => {
      await result.current.handleConfirmSale(payments, "cs-1", 0, 0, "c-1");
    });

    expect(createSaleAsync).toHaveBeenCalledWith(
      expect.objectContaining({ payments, cashSessionId: "cs-1", customerId: "c-1" }),
    );
  });

  it("leaves customerId undefined for callers that do not pass it", async () => {
    const createSaleAsync = vi.fn().mockResolvedValue(undefined);
    const { result } = setup(createSaleAsync);

    await act(async () => {
      await result.current.handleConfirmSale(payments, "cs-1", 0, 0);
    });

    expect(createSaleAsync.mock.calls[0][0].customerId).toBeUndefined();
  });

  it("keeps the cart and surfaces the server message when the sale fails", async () => {
    const createSaleAsync = vi.fn().mockRejectedValue({
      error: "CUSTOMER_REQUIRED_FOR_ACCOUNT",
      message: "Seleccioná un cliente para la venta en cuenta corriente",
    });
    const { result, clearCart } = setup(createSaleAsync);

    await act(async () => {
      await result.current.handleConfirmSale(payments, "cs-1", 0, 0, "c-1");
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Seleccioná un cliente para la venta en cuenta corriente",
    );
    expect(clearCart).not.toHaveBeenCalled();
    expect(result.current.pendingTicket).toBeNull();
  });

  it("clears the cart and builds the ticket with the account label on success", async () => {
    const createSaleAsync = vi.fn().mockResolvedValue(undefined);
    const { result, clearCart } = setup(createSaleAsync);

    await act(async () => {
      await result.current.handleConfirmSale(payments, "cs-1", 0, 0, "c-1");
    });

    expect(clearCart).toHaveBeenCalled();
    expect(result.current.pendingTicket!.payments.map((p) => p.methodLabel)).toEqual([
      "Efectivo",
      "Cuenta corriente",
    ]);
  });
});

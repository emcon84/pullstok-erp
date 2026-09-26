import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
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
  { method: "TARJETA_CREDITO" as const, amount: 400 },
];

function setup(createSale: ReturnType<typeof vi.fn>) {
  mockUseCreateSale.mockReturnValue({ createSale } as never);
  return renderHook(() =>
    useVendorCheckout({
      branchId: "b1",
      cartItems: [item],
      clearCart: vi.fn(),
      totalAmount: 1000,
    }),
  );
}

describe("useVendorCheckout — credit card surcharge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateOrder.mockReturnValue({ submitOrder: vi.fn(), loading: false } as never);
  });

  it("forwards surchargePct to createSale with the BASE payments", async () => {
    const createSale = vi.fn().mockResolvedValue({});
    const { result } = setup(createSale);

    await act(async () => {
      await result.current.handleConfirmSale(payments, "cs-1", 0, 10);
    });

    expect(createSale).toHaveBeenCalledWith(
      expect.objectContaining({ payments, cashSessionId: "cs-1", discountPct: 0, surchargePct: 10 }),
    );
  });

  it("leaves surchargePct undefined for callers that do not pass it", async () => {
    const createSale = vi.fn().mockResolvedValue({});
    const { result } = setup(createSale);

    await act(async () => {
      await result.current.handleConfirmSale(payments, "cs-1", 0);
    });

    expect(createSale.mock.calls[0][0].surchargePct).toBeUndefined();
  });

  it("builds the ticket with the surcharge over the card row", async () => {
    const { result } = setup(vi.fn().mockResolvedValue({}));

    await act(async () => {
      await result.current.handleConfirmSale(payments, "cs-1", 0, 10);
    });

    const t = result.current.pendingTicket!;
    expect(t.surchargePct).toBe(10);
    expect(t.surchargeAmount).toBe(40);
    expect(t.total).toBe(1040);
    // Σ payments == total: the card row shows what was actually charged.
    expect(t.payments.map((p) => p.amount)).toEqual([600, 440]);
  });
});

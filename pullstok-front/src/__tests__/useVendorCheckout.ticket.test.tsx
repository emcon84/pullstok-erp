import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVendorCheckout } from "../components/hooks/useVendorCheckout";
import { useCreateSale } from "../components/hooks/useSales";
import { useCreateOrder } from "../components/hooks/useOrder";
import type { VendorCartItem } from "../components/hooks/useVendorCart";

// Snapshot del ticket: se toma del carrito ANTES de clearCart() y solo se
// expone (pendingTicket) cuando la venta salió bien.
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../components/hooks/useSales", () => ({ useCreateSale: vi.fn() }));
vi.mock("../components/hooks/useOrder", () => ({ useCreateOrder: vi.fn() }));

const mockUseCreateSale = vi.mocked(useCreateSale);
const mockUseCreateOrder = vi.mocked(useCreateOrder);

const bolsa: VendorCartItem = {
  productId: "p1",
  name: "Royal Canin 15kg",
  code: "R15",
  price: 8000,
  stock: 10,
  quantity: 2,
  branchId: "b1",
  saleMode: "BOLSA_CERRADA",
};

const suelto: VendorCartItem = {
  productId: "cell-1",
  name: "interno",
  looseName: "ROYAL · ADULTO",
  code: "",
  price: 8000,
  stock: 0,
  quantity: 1.5,
  branchId: "b1",
  saleMode: "POR_PESO",
  loosePriceId: "cell-1",
};

function setup(createSale: ReturnType<typeof vi.fn>, items: VendorCartItem[], extra = {}) {
  mockUseCreateSale.mockReturnValue({ createSale } as never);
  const clearCart = vi.fn();
  const hook = renderHook(() =>
    useVendorCheckout({
      branchId: "b1",
      cartItems: items,
      clearCart,
      totalAmount: items.reduce((s, i) => s + i.price * i.quantity, 0),
      ...extra,
    }),
  );
  return { ...hook, clearCart };
}

describe("useVendorCheckout — snapshot del ticket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateOrder.mockReturnValue({ submitOrder: vi.fn(), loading: false } as never);
  });

  it("sin venta previa: pendingTicket es null", () => {
    const { result } = setup(vi.fn().mockResolvedValue({}), [bolsa]);
    expect(result.current.pendingTicket).toBeNull();
  });

  it("venta OK: expone pendingTicket con líneas, descuento, total y pagos", async () => {
    const { result, clearCart } = setup(vi.fn().mockResolvedValue({}), [bolsa, suelto], {
      ticketCompany: { businessName: "Mi Pet Shop", taxId: "30-1", address: "Calle 1" },
    });

    await act(async () => {
      await result.current.handleConfirmSale(
        [
          { method: "EFECTIVO", amount: 20000 },
          { method: "QR", amount: 4400 },
        ],
        "cs-1",
        10,
      );
    });

    expect(clearCart).toHaveBeenCalledTimes(1);
    const t = result.current.pendingTicket!;
    expect(t).not.toBeNull();
    // 2 x 8000 + 1,5 kg x 8000 = 28000; 10% → 2800 → 25200
    expect(t.subtotal).toBe(28000);
    expect(t.discountAmount).toBe(2800);
    expect(t.total).toBe(25200);
    expect(t.lines.map((l) => l.label)).toEqual(["Royal Canin 15kg", "ROYAL · ADULTO"]);
    expect(t.payments.map((p) => p.methodLabel)).toEqual(["Efectivo", "QR"]);
    expect(t.businessName).toBe("Mi Pet Shop");
    expect(t.taxId).toBe("30-1");
    expect(t.address).toBe("Calle 1");
    expect(new Date(t.issuedAt).getTime()).not.toBeNaN();
  });

  it("sin ticketCompany usa el nombre por defecto (callers legacy)", async () => {
    const { result } = setup(vi.fn().mockResolvedValue({}), [bolsa]);
    await act(async () => {
      await result.current.handleConfirmSale();
    });
    expect(result.current.pendingTicket!.businessName).toBe("Pullstok");
    expect(result.current.pendingTicket!.total).toBe(16000);
  });

  it("venta fallida: NO hay pendingTicket y el carrito no se limpia", async () => {
    const createSale = vi.fn().mockRejectedValue(new Error("boom"));
    const { result, clearCart } = setup(createSale, [bolsa]);

    await act(async () => {
      await result.current.handleConfirmSale();
    });

    expect(clearCart).not.toHaveBeenCalled();
    expect(result.current.pendingTicket).toBeNull();
  });

  it("dismissTicket limpia el ticket pendiente", async () => {
    const { result } = setup(vi.fn().mockResolvedValue({}), [bolsa]);
    await act(async () => {
      await result.current.handleConfirmSale();
    });
    expect(result.current.pendingTicket).not.toBeNull();

    act(() => result.current.dismissTicket());
    expect(result.current.pendingTicket).toBeNull();
  });

  it("una venta nueva reemplaza el ticket pendiente anterior", async () => {
    const { result } = setup(vi.fn().mockResolvedValue({}), [bolsa]);
    await act(async () => {
      await result.current.handleConfirmSale(undefined, undefined, 0);
    });
    const first = result.current.pendingTicket;
    await act(async () => {
      await result.current.handleConfirmSale(undefined, undefined, 50);
    });
    expect(result.current.pendingTicket).not.toBe(first);
    expect(result.current.pendingTicket!.discountPct).toBe(50);
  });
});

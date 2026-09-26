import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CartItem } from "@/models/salesModel";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/hooks/useOrder", () => ({
  useCreateOrder: vi.fn(),
  useOrders: vi.fn(),
  useUpdateOrder: vi.fn(),
  useDeleteOrder: vi.fn(),
}));
vi.mock("@/components/hooks/useBudget", () => ({
  useGetBudgetByID: vi.fn(),
  useGetBudgets: vi.fn(),
}));
vi.mock("@/components/hooks/useCustomer", () => ({ useCustomers: vi.fn() }));
vi.mock("@/components/hooks/useProducts", () => ({ usePorducts: vi.fn() }));
vi.mock("@/components/hooks/useSales", () => ({ useCreateSale: vi.fn() }));
vi.mock("@/components/hooks/useWhatsappOrders", () => ({
  useWhatsappDrafts: vi.fn(),
  useApproveDraft: vi.fn(),
  useSendConfirmation: vi.fn(),
}));

// Orders mounts two drawers; the second one ("Crear Venta desde Pedido") turns
// an order into a sale. Capture its onConfirm by title.
const drawers = vi.hoisted(() => ({
  byTitle: {} as Record<string, (...args: unknown[]) => unknown>,
}));
vi.mock("@/components/molecules/SalesDrawer", () => ({
  SalesDrawer: (props: { title: string; onConfirm: (...args: unknown[]) => unknown }) => {
    drawers.byTitle[props.title] = props.onConfirm;
    return null;
  },
}));

import { Orders } from "@/views/Orders";
import {
  useCreateOrder,
  useOrders,
  useUpdateOrder,
  useDeleteOrder,
} from "@/components/hooks/useOrder";
import { useGetBudgetByID, useGetBudgets } from "@/components/hooks/useBudget";
import { useCustomers } from "@/components/hooks/useCustomer";
import { usePorducts } from "@/components/hooks/useProducts";
import { useCreateSale } from "@/components/hooks/useSales";
import {
  useWhatsappDrafts,
  useApproveDraft,
  useSendConfirmation,
} from "@/components/hooks/useWhatsappOrders";

const cart = [{ product: { _id: "p1", name: "X", price: 1000 }, quantity: 1, totalPrice: 1000 }] as CartItem[];
const payments = [{ method: "TARJETA_CREDITO" as const, amount: 1000 }];

describe("Orders page — credit card surcharge on order → sale", () => {
  const createSale = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    drawers.byTitle = {};
    vi.mocked(useCreateOrder).mockReturnValue({ submitOrder: vi.fn() } as never);
    vi.mocked(useOrders).mockReturnValue({ orders: [], loading: false, error: null } as never);
    vi.mocked(useUpdateOrder).mockReturnValue({ updateOrder: vi.fn() } as never);
    vi.mocked(useDeleteOrder).mockReturnValue({ deleteOrder: vi.fn() } as never);
    vi.mocked(useGetBudgets).mockReturnValue({ budgets: [] } as never);
    vi.mocked(useGetBudgetByID).mockReturnValue({} as never);
    vi.mocked(useCustomers).mockReturnValue({ customers: [] } as never);
    vi.mocked(usePorducts).mockReturnValue({ products: [] } as never);
    vi.mocked(useCreateSale).mockReturnValue({ createSale } as never);
    vi.mocked(useWhatsappDrafts).mockReturnValue({ drafts: [] } as never);
    vi.mocked(useApproveDraft).mockReturnValue({ approve: vi.fn() } as never);
    vi.mocked(useSendConfirmation).mockReturnValue({ send: vi.fn(), loading: false } as never);
  });

  it("forwards surchargePct to createSale", () => {
    render(
      <MemoryRouter>
        <Orders />
      </MemoryRouter>,
    );

    drawers.byTitle["Crear Venta desde Pedido"](cart, "", "o-1", "", payments, "cs-1", 5, 10);

    expect(createSale).toHaveBeenCalledWith(
      {
        cart,
        orderId: "o-1",
        payments,
        cashSessionId: "cs-1",
        discountPct: 5,
        surchargePct: 10,
      },
      expect.any(Object),
    );
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CartItem } from "@/models/salesModel";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/hooks/useSales", () => ({
  useGetSales: vi.fn(),
  useCreateSale: vi.fn(),
  useDeleteSale: vi.fn(),
}));
vi.mock("@/components/hooks/useOrder", () => ({ useOrders: vi.fn() }));
vi.mock("@/components/hooks/useProducts", () => ({ usePorducts: vi.fn() }));
vi.mock("@/components/hooks/useCustomer", () => ({
  useCustomers: vi.fn(),
  useCreateCustomer: vi.fn(),
}));
vi.mock("@/components/hooks/useInvoices", () => ({
  useCreateInvoiceFromSale: vi.fn(),
}));

// The drawer is the unit under test elsewhere: here we only capture the
// onConfirm the page hands it, to check what reaches createSale.
const drawer = vi.hoisted(() => ({
  onConfirm: undefined as undefined | ((...args: unknown[]) => unknown),
}));
vi.mock("@/components/molecules/SalesDrawer", () => ({
  SalesDrawer: (props: { onConfirm: (...args: unknown[]) => unknown }) => {
    drawer.onConfirm = props.onConfirm;
    return null;
  },
}));

import { SalesPage } from "@/views/Sales";
import { useGetSales, useCreateSale, useDeleteSale } from "@/components/hooks/useSales";
import { useOrders } from "@/components/hooks/useOrder";
import { usePorducts } from "@/components/hooks/useProducts";
import { useCustomers, useCreateCustomer } from "@/components/hooks/useCustomer";
import { useCreateInvoiceFromSale } from "@/components/hooks/useInvoices";

const cart = [{ product: { _id: "p1", name: "X", price: 1000 }, quantity: 1, totalPrice: 1000 }] as CartItem[];
const payments = [{ method: "TARJETA_CREDITO" as const, amount: 1000 }];

describe("Sales page — credit card surcharge", () => {
  const createSale = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    drawer.onConfirm = undefined;
    vi.mocked(useGetSales).mockReturnValue({ sales: [], loading: false, error: null } as never);
    vi.mocked(useCreateSale).mockReturnValue({ createSale } as never);
    vi.mocked(useDeleteSale).mockReturnValue({ deleteSale: vi.fn() } as never);
    vi.mocked(useOrders).mockReturnValue({ orders: [] } as never);
    vi.mocked(usePorducts).mockReturnValue({ products: [] } as never);
    vi.mocked(useCustomers).mockReturnValue({ customers: [] } as never);
    vi.mocked(useCreateCustomer).mockReturnValue({
      submitCustomerAsync: vi.fn(),
      loadingCustomer: false,
    } as never);
    vi.mocked(useCreateInvoiceFromSale).mockReturnValue({
      invoiceFromSale: vi.fn(),
      loadingInvoiceFromSale: false,
    } as never);
  });

  it("forwards surchargePct to createSale", async () => {
    render(
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>,
    );

    await drawer.onConfirm!(cart, "", "", "", payments, "cs-1", 5, 10);

    expect(createSale).toHaveBeenCalledWith({
      cart,
      orderId: undefined,
      payments,
      cashSessionId: "cs-1",
      discountPct: 5,
      surchargePct: 10,
    });
  });
});

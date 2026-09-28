import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCreateSale } from "../components/hooks/useSales";
import { createSale } from "../services/saleServices";
import type { CartItem } from "../models/salesModel";

// customerId (venta a cuenta corriente) viaja en el POST solo cuando existe,
// así el payload de las demás ventas queda exactamente igual.
vi.mock("../services/saleServices", () => ({
  createSale: vi.fn(),
}));

const mockedCreateSale = vi.mocked(createSale);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const cartItem: CartItem = {
  product: {
    _id: "p1",
    id: "p1",
    name: "Royal Canin 15kg",
    price: 1000,
    quantity: 10,
    description: "",
    category: "ALIMENTO",
  } as CartItem["product"],
  quantity: 1,
  totalPrice: 1000,
  saleMode: "BOLSA_CERRADA",
};

async function send(extra: { customerId?: string }) {
  const { result } = renderHook(() => useCreateSale(), { wrapper });
  act(() => {
    result.current.createSale({
      cart: [cartItem],
      payments: [{ method: "CUENTA_CORRIENTE", amount: 1000 }],
      ...extra,
    });
  });
  await waitFor(() => expect(mockedCreateSale).toHaveBeenCalled());
  return mockedCreateSale.mock.calls[0][0];
}

describe("useCreateSale — customerId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateSale.mockResolvedValue();
  });

  it("forwards customerId in the request", async () => {
    const req = await send({ customerId: "c-1" });
    expect(req.customerId).toBe("c-1");
    expect(req.payments).toEqual([{ method: "CUENTA_CORRIENTE", amount: 1000 }]);
  });

  it("omits customerId when undefined", async () => {
    const req = await send({});
    expect(req).not.toHaveProperty("customerId");
  });

  it("exposes createSaleAsync, which rejects with the server error", async () => {
    mockedCreateSale.mockRejectedValue({ message: "Cliente no encontrado" });
    const { result } = renderHook(() => useCreateSale(), { wrapper });

    await expect(
      result.current.createSaleAsync({ cart: [cartItem], customerId: "nope" }),
    ).rejects.toMatchObject({ message: "Cliente no encontrado" });
  });
});

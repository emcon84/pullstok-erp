import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCreateSale } from "../components/hooks/useSales";
import { createSale } from "../services/saleServices";
import type { CartItem } from "../models/salesModel";

// sdd/venta-pastillas-sueltas-blister — useCreateSale arma el payload de
// products[] a partir del CartItem[]: la línea POR_UNIDAD_BLISTER debe
// reenviar piecesPerBlister (el server lo exige, ver saleProductSchema/T1).
vi.mock("../services/saleServices", () => ({
  createSale: vi.fn(),
}));

const mockedCreateSale = vi.mocked(createSale);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const blisterCartItem: CartItem = {
  product: {
    _id: "p-blister",
    id: "p-blister",
    name: "IBUPROFENO 400 X BLISTER",
    price: 700,
    quantity: 20,
    description: "",
    category: "FARMACIA",
  } as CartItem["product"],
  quantity: 4,
  totalPrice: 2800,
  saleMode: "POR_UNIDAD_BLISTER",
  piecesPerBlister: 7,
};

describe("useCreateSale — payload de línea de pastillas sueltas de blister", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateSale.mockResolvedValue();
  });

  it("sends piecesPerBlister in products[] for a POR_UNIDAD_BLISTER line", async () => {
    const { result } = renderHook(() => useCreateSale(), { wrapper });

    act(() => {
      result.current.createSale({ cart: [blisterCartItem] });
    });

    await waitFor(() => expect(mockedCreateSale).toHaveBeenCalled());
    const [saleRequest] = mockedCreateSale.mock.calls[0];
    expect(saleRequest.products).toHaveLength(1);
    expect(saleRequest.products[0].saleMode).toBe("POR_UNIDAD_BLISTER");
    expect(saleRequest.products[0].piecesPerBlister).toBe(7);
    expect(saleRequest.products[0].productId).toBe("p-blister");
  });
});

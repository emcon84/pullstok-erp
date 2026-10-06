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

// Un pedido trae el producto con `category` populada ({ id, name }); el server
// exige string (products.N.category) y rechazaba la venta con 400.
describe("useCreateSale — category del producto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateSale.mockResolvedValue();
  });

  const lineWithCategory = (category: unknown, id = "p-1"): CartItem => ({
    product: {
      _id: id,
      id,
      name: "PEDIGREE LATA",
      price: 1000,
      quantity: 10,
      description: "",
      category,
    } as unknown as CartItem["product"],
    quantity: 1,
    totalPrice: 1000,
  });

  const sentCategories = async (cart: CartItem[]) => {
    const { result } = renderHook(() => useCreateSale(), { wrapper });
    act(() => {
      result.current.createSale({ cart });
    });
    await waitFor(() => expect(mockedCreateSale).toHaveBeenCalled());
    return mockedCreateSale.mock.calls[0][0].products.map((p) => p.category);
  };

  it("sends the category name when the product carries a populated category object", async () => {
    expect(await sentCategories([lineWithCategory({ id: "c1", name: "Alimento húmedo" })])).toEqual([
      "Alimento húmedo",
    ]);
  });

  it("keeps a string category and falls back to empty when missing or malformed", async () => {
    expect(
      await sentCategories([
        lineWithCategory("FARMACIA", "a"),
        lineWithCategory(undefined, "b"),
        lineWithCategory(null, "c"),
        lineWithCategory({ id: "c2" }, "d"),
      ]),
    ).toEqual(["FARMACIA", "", "", ""]);
  });
});


import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCreateSale } from "../components/hooks/useSales";
import { createSale } from "../services/saleServices";
import type { CartItem } from "../models/salesModel";

vi.mock("../services/saleServices", () => ({ createSale: vi.fn() }));
const mockedCreateSale = vi.mocked(createSale);

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const line = (extra: Partial<CartItem> = {}): CartItem => ({
  product: { _id: "p1", id: "p1", name: "Ibuprofeno (Blister)", price: 150, quantity: 5, description: "", category: "" } as CartItem["product"],
  quantity: 2,
  totalPrice: 300,
  saleMode: "BOLSA_CERRADA",
  ...extra,
});

describe("useCreateSale presentation lines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateSale.mockResolvedValue();
  });

  it("sends presentationId with BOLSA_CERRADA and an integer quantity", async () => {
    const { result } = renderHook(() => useCreateSale(), { wrapper });
    act(() => {
      result.current.createSale({ cart: [line({ presentationId: "b", presentationName: "Blister", presentationFactor: 10 })] });
    });
    await waitFor(() => expect(mockedCreateSale).toHaveBeenCalled());
    const [req] = mockedCreateSale.mock.calls[0];
    expect(req.products[0]).toMatchObject({ productId: "p1", presentationId: "b", saleMode: "BOLSA_CERRADA", quantity: "2" });
  });

  it("omits presentationId for legacy lines", async () => {
    const { result } = renderHook(() => useCreateSale(), { wrapper });
    act(() => {
      result.current.createSale({ cart: [line()] });
    });
    await waitFor(() => expect(mockedCreateSale).toHaveBeenCalled());
    expect(mockedCreateSale.mock.calls[0][0].products[0]).not.toHaveProperty("presentationId");
  });
});

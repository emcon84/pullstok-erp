import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCreateSale } from "../components/hooks/useSales";
import { createSale } from "../services/saleServices";
import type { CartItem } from "../models/salesModel";

// The credit card surcharge % travels in the POST body only when > 0, so the
// payload of every other sale stays exactly as before.
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

async function send(extra: { surchargePct?: number }) {
  const { result } = renderHook(() => useCreateSale(), { wrapper });
  act(() => {
    result.current.createSale({
      cart: [cartItem],
      payments: [{ method: "TARJETA_CREDITO", amount: 1000 }],
      ...extra,
    });
  });
  await waitFor(() => expect(mockedCreateSale).toHaveBeenCalled());
  return mockedCreateSale.mock.calls[0][0];
}

describe("useCreateSale — surchargePct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateSale.mockResolvedValue();
  });

  it("forwards surchargePct in the request when > 0", async () => {
    const req = await send({ surchargePct: 10 });
    expect(req.surchargePct).toBe(10);
  });

  it("omits surchargePct when 0", async () => {
    const req = await send({ surchargePct: 0 });
    expect(req).not.toHaveProperty("surchargePct");
  });

  it("omits surchargePct when undefined", async () => {
    const req = await send({});
    expect(req).not.toHaveProperty("surchargePct");
  });
});

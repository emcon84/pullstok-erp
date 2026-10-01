import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  gramsToKg,
  formatFreeLineWeight,
  isFreeLineSaleItem,
} from "../lib/freeLine";
import { useVendorCart } from "../components/hooks/useVendorCart";
import { useCreateSale } from "../components/hooks/useSales";
import { createSale } from "../services/saleServices";
import { buildSaleTicket } from "../utils/saleTicket";
import type { CartItem } from "../models/salesModel";

// Venta libre: línea ad-hoc (nombre + gramos + total) sin Product. Se guarda en
// el carrito como línea POR_PESO (kg) con isFreeLine + lineTotal exacto.

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("../services/saleServices", () => ({ createSale: vi.fn() }));

describe("freeLine helpers", () => {
  it("gramsToKg convierte con resolución de gramo", () => {
    expect(gramsToKg(350)).toBe(0.35);
    expect(gramsToKg(1)).toBe(0.001);
    expect(gramsToKg(1250)).toBe(1.25);
  });

  it("formatFreeLineWeight: gramos bajo 1 kg, kg desde 1000 g", () => {
    expect(formatFreeLineWeight(0.35)).toBe("350 g");
    expect(formatFreeLineWeight(0.001)).toBe("1 g");
    expect(formatFreeLineWeight(1)).toBe("1 kg");
    expect(formatFreeLineWeight(1.25)).toBe("1,25 kg");
  });

  it("isFreeLineSaleItem: POR_PESO sin productId ni celda", () => {
    expect(isFreeLineSaleItem({ saleMode: "POR_PESO", productId: null, loosePriceId: null })).toBe(true);
    expect(isFreeLineSaleItem({ saleMode: "POR_PESO" })).toBe(true);
    expect(isFreeLineSaleItem({ saleMode: "POR_PESO", loosePriceId: "c1" })).toBe(false);
    expect(isFreeLineSaleItem({ saleMode: "POR_PESO", productId: "p1" })).toBe(false);
    expect(isFreeLineSaleItem({ saleMode: "BOLSA_CERRADA", productId: null })).toBe(false);
  });
});

describe("useVendorCart — addFreeLine", () => {
  beforeEach(() => localStorage.clear());

  it("agrega una línea POR_PESO en kg con total exacto y sin producto real", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() =>
      result.current.addFreeLine({ name: "  Hueso molido ", grams: 350, total: 2800 }, "b1"),
    );

    expect(result.current.items).toHaveLength(1);
    const it0 = result.current.items[0];
    expect(it0).toMatchObject({
      name: "Hueso molido",
      quantity: 0.35,
      saleMode: "POR_PESO",
      isFreeLine: true,
      lineTotal: 2800,
      stock: 0,
      branchId: "b1",
    });
    expect(it0.productId.startsWith("free-")).toBe(true);
    expect(it0.loosePriceId).toBeUndefined();
    expect(result.current.totalAmount).toBe(2800);
  });

  it("dos líneas libres iguales NO se fusionan (ids distintos)", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addFreeLine({ name: "Hueso", grams: 100, total: 500 }, "b1"));
    act(() => result.current.addFreeLine({ name: "Hueso", grams: 100, total: 500 }, "b1"));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].productId).not.toBe(result.current.items[1].productId);
    expect(result.current.totalAmount).toBe(1000);
  });

  it("el total del pedido suma lineTotal (sin deriva flotante)", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addFreeLine({ name: "A", grams: 123, total: 1234.56 }, "b1"));
    expect(result.current.totalAmount).toBe(1234.56);
  });

  it("updateQuantity NO altera una línea libre; removeFromCart sí la quita", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addFreeLine({ name: "Hueso", grams: 350, total: 2800 }, "b1"));
    const id = result.current.items[0].productId;

    act(() => result.current.updateQuantity(id, 5, "POR_PESO"));
    expect(result.current.items[0].quantity).toBe(0.35);

    act(() => result.current.removeFromCart(id, "POR_PESO"));
    expect(result.current.items).toHaveLength(0);
  });
});

describe("useCreateSale — payload de venta libre", () => {
  const mocked = vi.mocked(createSale);
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      children,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mocked.mockResolvedValue();
  });

  it("manda freeLine/name/quantity(kg)/lineTotal y NO productId ni loosePriceId", async () => {
    const line: CartItem = {
      product: { _id: "free-1", id: "free-1", name: "Hueso molido", price: 8000, quantity: 0, description: "", category: "" } as CartItem["product"],
      quantity: 0.35,
      totalPrice: 2800,
      saleMode: "POR_PESO",
      freeLine: true,
      lineTotal: 2800,
    };
    const { result } = renderHook(() => useCreateSale(), { wrapper });
    act(() => {
      result.current.createSale({ cart: [line] });
    });

    await waitFor(() => expect(mocked).toHaveBeenCalled());
    const p = mocked.mock.calls[0][0].products[0];
    expect(p).toMatchObject({
      freeLine: true,
      name: "Hueso molido",
      quantity: "0.35",
      lineTotal: 2800,
      saleMode: "POR_PESO",
    });
    expect(p.productId).toBeUndefined();
    expect(p.loosePriceId).toBeUndefined();
  });
});

describe("buildSaleTicket — línea libre", () => {
  it("muestra '350 g' y el total exacto tipeado", () => {
    const t = buildSaleTicket({
      issuedAt: new Date("2026-10-01T10:00:00Z"),
      items: [
        {
          name: "Hueso molido",
          price: 2800 / 0.35,
          quantity: 0.35,
          saleMode: "POR_PESO",
          isFreeLine: true,
          lineTotal: 2800,
        },
      ],
    });
    expect(t.lines[0].label).toBe("Hueso molido");
    expect(t.lines[0].detail).toBe("350 g");
    expect(t.lines[0].total).toBe(2800);
    expect(t.total).toBe(2800);
  });
});

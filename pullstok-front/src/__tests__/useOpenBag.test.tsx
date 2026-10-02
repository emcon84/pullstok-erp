import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openBag: vi.fn(),
}));

vi.mock("@/services/looseStock", () => ({ openBag: mocks.openBag }));
vi.mock("@/services/priceKgPlan", () => ({ getPriceKgPlan: vi.fn().mockResolvedValue([]) }));
vi.mock("@/services/priceKgTypes", () => ({ listPriceKgTypes: vi.fn().mockResolvedValue([]) }));
vi.mock("@/services/priceKgBrands", () => ({ listPriceKgBrands: vi.fn().mockResolvedValue([]) }));

import { useOpenBag } from "@/components/hooks/useOpenBag";

describe("useOpenBag — openBag error messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const attempt = async (error: Error) => {
    mocks.openBag.mockRejectedValue(error);
    const { result } = renderHook(() => useOpenBag({ branchId: "b-1" }));
    let thrown: Error | undefined;
    await act(async () => {
      try {
        await result.current.openBag("p-1", "cell-1");
      } catch (e) {
        thrown = e as Error;
      }
    });
    return { thrown, error: result.current.error };
  };

  it("shows the server message instead of a generic one", async () => {
    const serverMessage = 'Stock insuficiente de "DOGUI 15KG" en tu sucursal para abrir una bolsa';
    const { thrown, error } = await attempt(new Error(serverMessage));
    expect(thrown?.message).toBe(serverMessage);
    expect(error).toBe(serverMessage);
  });

  it("still maps raw domain codes to friendly Spanish", async () => {
    const { thrown } = await attempt(new Error("LOOSE_BAG_INSUFFICIENT_STOCK"));
    expect(thrown?.message).toBe("Sin stock de bolsas en tu sucursal");
  });

  it("falls back to the generic message when there is no detail", async () => {
    const { thrown } = await attempt(new Error(""));
    expect(thrown?.message).toBe("No se pudo abrir la bolsa");
  });
});

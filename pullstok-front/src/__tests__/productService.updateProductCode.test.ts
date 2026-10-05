import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({
  default: {
    put: vi.fn(),
    isAxiosError: (e: unknown) => !!(e as { isAxiosError?: boolean })?.isAxiosError,
  },
}));

import axios from "axios";
import { updateProduct } from "@/services/productService";

beforeEach(() => vi.clearAllMocks());

describe("updateProduct — error code", () => {
  it("keeps the server code on the thrown error (PRESENTATIONS_CATEGORY_LOCKED)", async () => {
    vi.mocked(axios.put).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "categoría bloqueada", code: "PRESENTATIONS_CATEGORY_LOCKED" } },
    });
    const err = await updateProduct({ _id: "p1", name: "x", price: 1, quantity: 1 }).catch((e) => e);
    expect(err.message).toBe("categoría bloqueada");
    expect(err.code).toBe("PRESENTATIONS_CATEGORY_LOCKED");
  });

  it("has no code when the server sends none", async () => {
    vi.mocked(axios.put).mockRejectedValue({ isAxiosError: true, response: { data: { message: "boom" } } });
    const err = await updateProduct({ _id: "p1", name: "x", price: 1, quantity: 1 }).catch((e) => e);
    expect(err.message).toBe("boom");
    expect(err.code).toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    delete: vi.fn(),
    isAxiosError: (e: unknown) => !!(e as { isAxiosError?: boolean })?.isAxiosError,
  },
}));

import axios from "axios";
import { addProductBarcode, deleteProductBarcode } from "@/services/productService";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("token", "tkn");
});

describe("addProductBarcode", () => {
  it("POSTs the code to /products/:id/barcodes and returns the created alias", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { id: "b1", code: "ALIAS-1" } });
    const res = await addProductBarcode("p1", "ALIAS-1");
    expect(res).toEqual({ id: "b1", code: "ALIAS-1" });
    const [url, body, config] = vi.mocked(axios.post).mock.calls[0];
    expect(url).toContain("/products/p1/barcodes");
    expect(body).toEqual({ code: "ALIAS-1" });
    expect(config?.headers).toEqual({ Authorization: "Bearer tkn" });
  });

  it("surfaces the 409 server message", async () => {
    vi.mocked(axios.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "El código ya está en uso" } },
    });
    await expect(addProductBarcode("p1", "X")).rejects.toThrow("El código ya está en uso");
  });

  it("falls back to a generic message", async () => {
    vi.mocked(axios.post).mockRejectedValue({ isAxiosError: true, response: { data: {} } });
    await expect(addProductBarcode("p1", "X")).rejects.toThrow("add product barcode failed");
  });
});

describe("deleteProductBarcode", () => {
  it("DELETEs /products/:id/barcodes/:barcodeId", async () => {
    vi.mocked(axios.delete).mockResolvedValue({ data: undefined });
    await deleteProductBarcode("p1", "b1");
    const [url, config] = vi.mocked(axios.delete).mock.calls[0];
    expect(url).toContain("/products/p1/barcodes/b1");
    expect(config?.headers).toEqual({ Authorization: "Bearer tkn" });
  });

  it("surfaces the server message on failure", async () => {
    vi.mocked(axios.delete).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "no encontrado" } },
    });
    await expect(deleteProductBarcode("p1", "b1")).rejects.toThrow("no encontrado");
  });
});

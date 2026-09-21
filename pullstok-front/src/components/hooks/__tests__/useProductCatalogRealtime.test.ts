import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const {
  getSocketMock,
  fetchAndPatchProductMock,
  removeProductFromCatalogMock,
} = vi.hoisted(() => ({
  getSocketMock: vi.fn(),
  fetchAndPatchProductMock: vi.fn(),
  removeProductFromCatalogMock: vi.fn(),
}));

vi.mock("../../../lib/socket", () => ({
  getSocket: getSocketMock,
}));

vi.mock("../../../lib/offlineCatalog", () => ({
  fetchAndPatchProduct: fetchAndPatchProductMock,
  removeProductFromCatalog: removeProductFromCatalogMock,
}));

import { useProductCatalogRealtime } from "../useProductCatalogRealtime";

type Handler = (payload: unknown) => void;

function createSocketMock() {
  const handlers = new Map<string, Handler>();
  return {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
    }),
    emit: vi.fn(),
    trigger(event: string, payload: unknown) {
      handlers.get(event)?.(payload);
    },
  };
}

describe("useProductCatalogRealtime", () => {
  let socket: ReturnType<typeof createSocketMock>;

  beforeEach(() => {
    vi.resetAllMocks();
    socket = createSocketMock();
    getSocketMock.mockReturnValue(socket);
    fetchAndPatchProductMock.mockResolvedValue(undefined);
    removeProductFromCatalogMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("no se conecta si no hay token en localStorage", () => {
    renderHook(() => useProductCatalogRealtime());
    expect(getSocketMock).not.toHaveBeenCalled();
  });

  it("se conecta con el token de localStorage y se suscribe a product:changed", () => {
    localStorage.setItem("token", "tok-1");
    renderHook(() => useProductCatalogRealtime());

    expect(getSocketMock).toHaveBeenCalledWith("tok-1");
    expect(socket.on).toHaveBeenCalledWith("product:changed", expect.any(Function));
  });

  it("action 'updated' -> llama fetchAndPatchProduct con el productId, sin remover", async () => {
    localStorage.setItem("token", "tok-1");
    renderHook(() => useProductCatalogRealtime());

    socket.trigger("product:changed", { productId: "p1", action: "updated" });
    await Promise.resolve();

    expect(fetchAndPatchProductMock).toHaveBeenCalledWith("p1");
    expect(removeProductFromCatalogMock).not.toHaveBeenCalled();
  });

  it("action 'created' -> llama fetchAndPatchProduct con el productId", async () => {
    localStorage.setItem("token", "tok-1");
    renderHook(() => useProductCatalogRealtime());

    socket.trigger("product:changed", { productId: "p2", action: "created" });
    await Promise.resolve();

    expect(fetchAndPatchProductMock).toHaveBeenCalledWith("p2");
  });

  it("action 'deleted' -> llama removeProductFromCatalog con el productId, sin patchear", async () => {
    localStorage.setItem("token", "tok-1");
    renderHook(() => useProductCatalogRealtime());

    socket.trigger("product:changed", { productId: "p3", action: "deleted" });
    await Promise.resolve();

    expect(removeProductFromCatalogMock).toHaveBeenCalledWith("p3");
    expect(fetchAndPatchProductMock).not.toHaveBeenCalled();
  });

  it("cleanup: hace socket.off('product:changed', handler) al desmontar, sin desconectar el socket compartido", () => {
    localStorage.setItem("token", "tok-1");
    const { unmount } = renderHook(() => useProductCatalogRealtime());

    unmount();

    expect(socket.off).toHaveBeenCalledWith("product:changed", expect.any(Function));
    expect(socket).not.toHaveProperty("disconnect");
  });

  it("no rompe si fetchAndPatchProduct rechaza (fire-and-forget)", async () => {
    localStorage.setItem("token", "tok-1");
    fetchAndPatchProductMock.mockRejectedValueOnce(new Error("boom"));
    renderHook(() => useProductCatalogRealtime());

    expect(() =>
      socket.trigger("product:changed", { productId: "p4", action: "created" }),
    ).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});

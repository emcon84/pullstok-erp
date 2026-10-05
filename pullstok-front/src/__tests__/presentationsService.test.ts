import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => {
  const isAxiosError = (e: unknown) => !!(e as { isAxiosError?: boolean })?.isAxiosError;
  return { default: { put: vi.fn(), post: vi.fn(), isAxiosError } };
});

import axios from "axios";
import {
  replacePresentations,
  enablePresentations,
  disablePresentations,
  PresentationsApiError,
} from "@/services/presentationsService";

const input = [
  { name: "Caja", sortOrder: 0, factor: 10, price: 1000, wholesalePrice: null, isActive: true },
  { id: "u", name: "Unidad", sortOrder: 1, factor: 1, price: 120, wholesalePrice: 100, isActive: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("token", "tok");
});

describe("presentationsService", () => {
  it("replacePresentations PUTs the whole list with the auth header and returns the list", async () => {
    vi.mocked(axios.put).mockResolvedValue({
      data: [
        { id: "u", name: "Unidad", factor: 1, price: "120.50", wholesalePrice: null, sortOrder: 1, isActive: true },
        { id: "old", name: "Vieja", factor: 3, price: "5", wholesalePrice: "4", sortOrder: 2, isActive: false },
      ],
    });
    const res = await replacePresentations("p1", input);
    const [url, body, cfg] = vi.mocked(axios.put).mock.calls[0];
    expect(url).toMatch(/\/products\/p1\/presentations$/);
    expect(body).toEqual({ presentations: input });
    expect(cfg).toEqual({ headers: { Authorization: "Bearer tok" } });
    // Prisma Decimals arrive as strings and inactive rows are dropped.
    expect(res).toEqual([
      { id: "u", name: "Unidad", factor: 1, price: 120.5, wholesalePrice: null, sortOrder: 1 },
    ]);
  });

  it("enablePresentations POSTs presentations and stockCountedIn", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: [{ id: "b", name: "Caja", factor: 10, price: "1000", wholesalePrice: "800", sortOrder: 0, isActive: true }],
    });
    const res = await enablePresentations("p1", input, "Caja");
    expect(res).toEqual([
      { id: "b", name: "Caja", factor: 10, price: 1000, wholesalePrice: 800, sortOrder: 0 },
    ]);
    const [url, body] = vi.mocked(axios.post).mock.calls[0];
    expect(url).toMatch(/\/products\/p1\/presentations\/enable$/);
    expect(body).toEqual({ presentations: input, stockCountedIn: "Caja" });
  });

  it("enablePresentations omits stockCountedIn when not provided", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: [] });
    await enablePresentations("p1", input);
    expect(vi.mocked(axios.post).mock.calls[0][1]).toEqual({ presentations: input });
  });

  it("disablePresentations POSTs to /disable", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: [{ id: "u", name: "Unidad", factor: 1, price: "1", wholesalePrice: null, sortOrder: 0, isActive: false }],
    });
    const res = await disablePresentations("p1");
    expect(res).toEqual([]);
    expect(vi.mocked(axios.post).mock.calls[0][0]).toMatch(/\/products\/p1\/presentations\/disable$/);
  });

  it("surfaces the server code and message on a 409", async () => {
    vi.mocked(axios.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "hay stock", code: "PRESENTATION_STOCK_NOT_ZERO" } },
    });
    const err = await disablePresentations("p1").catch((e) => e);
    expect(err).toBeInstanceOf(PresentationsApiError);
    expect(err.code).toBe("PRESENTATION_STOCK_NOT_ZERO");
    expect(err.message).toBe("hay stock");
  });

  it("wraps non-axios errors without a code", async () => {
    vi.mocked(axios.put).mockRejectedValue(new Error("boom"));
    const err = await replacePresentations("p1", input).catch((e) => e);
    expect(err).toBeInstanceOf(PresentationsApiError);
    expect(err.code).toBeUndefined();
  });
});

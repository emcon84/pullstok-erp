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
    vi.mocked(axios.put).mockResolvedValue({ data: [{ id: "u" }] });
    const res = await replacePresentations("p1", input);
    const [url, body, cfg] = vi.mocked(axios.put).mock.calls[0];
    expect(url).toMatch(/\/products\/p1\/presentations$/);
    expect(body).toEqual({ presentations: input });
    expect(cfg).toEqual({ headers: { Authorization: "Bearer tok" } });
    expect(res).toEqual([{ id: "u" }]);
  });

  it("enablePresentations POSTs presentations and stockCountedIn", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { ok: true } });
    await enablePresentations("p1", input, "Caja");
    const [url, body] = vi.mocked(axios.post).mock.calls[0];
    expect(url).toMatch(/\/products\/p1\/presentations\/enable$/);
    expect(body).toEqual({ presentations: input, stockCountedIn: "Caja" });
  });

  it("enablePresentations omits stockCountedIn when not provided", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} });
    await enablePresentations("p1", input);
    expect(vi.mocked(axios.post).mock.calls[0][1]).toEqual({ presentations: input });
  });

  it("disablePresentations POSTs to /disable", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} });
    await disablePresentations("p1");
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

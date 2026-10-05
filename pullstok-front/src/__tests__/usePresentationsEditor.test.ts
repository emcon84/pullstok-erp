import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/services/presentationsService", async () => {
  const actual = await vi.importActual<typeof import("@/services/presentationsService")>(
    "@/services/presentationsService",
  );
  return {
    ...actual,
    replacePresentations: vi.fn(),
    enablePresentations: vi.fn(),
    disablePresentations: vi.fn(),
  };
});

import {
  replacePresentations,
  enablePresentations,
  disablePresentations,
  PresentationsApiError,
} from "@/services/presentationsService";
import {
  usePresentationsEditor,
  presentationErrorMessage,
} from "@/components/hooks/usePresentationsEditor";

const box = { id: "p-box", name: "Caja", factor: 10, price: 1000, wholesalePrice: 800, sortOrder: 0 };
const unit = { id: "p-unit", name: "Unidad", factor: 1, price: 120, wholesalePrice: null, sortOrder: 1 };

const setup = (presentations = [box, unit], onChanged = vi.fn()) => {
  const hook = renderHook(() =>
    usePresentationsEditor({ productId: "p1", presentations, basePrice: 120, onChanged }),
  );
  return { ...hook, onChanged };
};

beforeEach(() => vi.clearAllMocks());

describe("usePresentationsEditor — rows", () => {
  it("builds editable rows from the product presentations ordered by sortOrder", () => {
    const { result } = setup([unit, box]);
    expect(result.current.rows.map((r) => [r.name, r.factor, r.price, r.wholesalePrice])).toEqual([
      ["Caja", "10", "1000", "800"],
      ["Unidad", "1", "120", ""],
    ]);
  });

  it("starts from a locked base draft priced like the product when nothing is configured", () => {
    const { result } = setup([]);
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]).toMatchObject({ name: "Unidad", factor: "1", price: "120" });
    expect(result.current.isBase(result.current.rows[0])).toBe(true);
  });

  it("adds, edits and removes a row", () => {
    const { result } = setup();
    act(() => result.current.addRow());
    expect(result.current.rows).toHaveLength(3);
    const key = result.current.rows[2].key;
    act(() => result.current.updateRow(key, { name: "Blister", factor: "5" }));
    expect(result.current.rows[2]).toMatchObject({ name: "Blister", factor: "5" });
    act(() => result.current.removeRow(key));
    expect(result.current.rows.map((r) => r.name)).toEqual(["Caja", "Unidad"]);
  });

  it("keeps the base row: cannot be removed nor have its factor changed", () => {
    const { result } = setup();
    const base = result.current.rows[1];
    act(() => result.current.removeRow(base.key));
    expect(result.current.rows).toHaveLength(2);
    act(() => result.current.updateRow(base.key, { factor: "3", name: "Pieza" }));
    expect(result.current.rows[1]).toMatchObject({ factor: "1", name: "Pieza" });
  });

  it("lets a new row be typed as 10 even though its first keystroke is 1", () => {
    const { result } = setup();
    act(() => result.current.addRow());
    const key = result.current.rows[2].key;
    act(() => result.current.updateRow(key, { factor: "1" }));
    act(() => result.current.updateRow(key, { factor: "10" }));
    expect(result.current.rows[2].factor).toBe("10");
    expect(result.current.isBase(result.current.rows[2])).toBe(false);
  });

  it("reorders rows up and down", () => {
    const { result } = setup();
    const boxKey = result.current.rows[0].key;
    act(() => result.current.moveRow(boxKey, 1));
    expect(result.current.rows.map((r) => r.name)).toEqual(["Unidad", "Caja"]);
    act(() => result.current.moveRow(boxKey, -1));
    expect(result.current.rows.map((r) => r.name)).toEqual(["Caja", "Unidad"]);
    act(() => result.current.moveRow(boxKey, -1)); // already first: no-op
    expect(result.current.rows.map((r) => r.name)).toEqual(["Caja", "Unidad"]);
  });
});

describe("usePresentationsEditor — save", () => {
  it("sends the whole list with ids, numeric values, sortOrder by position and null wholesale", async () => {
    vi.mocked(replacePresentations).mockResolvedValue([]);
    const { result, onChanged } = setup();
    act(() => result.current.updateRow(result.current.rows[0].key, { price: "1100" }));
    await act(async () => {
      await result.current.save();
    });
    expect(replacePresentations).toHaveBeenCalledWith("p1", [
      { id: "p-box", name: "Caja", sortOrder: 0, factor: 10, price: 1100, wholesalePrice: 800, isActive: true },
      { id: "p-unit", name: "Unidad", sortOrder: 1, factor: 1, price: 120, wholesalePrice: null, isActive: true },
    ]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("blocks a duplicate name client-side without calling the API", async () => {
    const { result } = setup();
    act(() => result.current.updateRow(result.current.rows[0].key, { name: " unidad " }));
    await act(async () => {
      await result.current.save();
    });
    expect(replacePresentations).not.toHaveBeenCalled();
    expect(result.current.error).toBe(presentationErrorMessage("PRESENTATION_NAME_DUPLICATE"));
  });

  it("blocks an invalid factor, an empty name and a missing price client-side", async () => {
    const { result } = setup();
    const key = result.current.rows[0].key;
    act(() => result.current.updateRow(key, { factor: "2.5" }));
    await act(async () => { await result.current.save(); });
    expect(result.current.error).toBe(presentationErrorMessage("PRESENTATION_FACTOR_INVALID"));

    act(() => result.current.updateRow(key, { factor: "10", name: "  " }));
    await act(async () => { await result.current.save(); });
    expect(result.current.error).toBe(presentationErrorMessage("PRESENTATION_NAME_REQUIRED"));

    act(() => result.current.updateRow(key, { name: "Caja", price: "" }));
    await act(async () => { await result.current.save(); });
    expect(result.current.error).toBe(presentationErrorMessage("PRESENTATION_PRICE_INVALID"));
    expect(replacePresentations).not.toHaveBeenCalled();
  });

  it("maps a server error code to its Spanish message and keeps the rows", async () => {
    vi.mocked(replacePresentations).mockRejectedValue(
      new PresentationsApiError("x", "PRESENTATION_BASE_LOCKED", 400),
    );
    const { result, onChanged } = setup();
    await act(async () => { await result.current.save(); });
    expect(result.current.error).toBe(presentationErrorMessage("PRESENTATION_BASE_LOCKED"));
    expect(onChanged).not.toHaveBeenCalled();
    expect(result.current.rows).toHaveLength(2);
  });
});

describe("usePresentationsEditor — enable / disable", () => {
  it("enable sends the rows without ids plus stockCountedIn", async () => {
    vi.mocked(enablePresentations).mockResolvedValue([]);
    const { result, onChanged } = setup([]);
    act(() => result.current.addRow());
    act(() =>
      result.current.updateRow(result.current.rows[1].key, { name: "Caja", factor: "10", price: "1000" }),
    );
    await act(async () => { await result.current.enable("Caja"); });
    expect(enablePresentations).toHaveBeenCalledWith(
      "p1",
      [
        { name: "Unidad", sortOrder: 0, factor: 1, price: 120, wholesalePrice: null, isActive: true },
        { name: "Caja", sortOrder: 1, factor: 10, price: 1000, wholesalePrice: null, isActive: true },
      ],
      "Caja",
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("re-seeds the rows with the server ids after enable so a later save keeps the base", async () => {
    const created = [
      { id: "s-box", name: "Caja", factor: 10, price: 1000, wholesalePrice: null, sortOrder: 0 },
      { id: "s-unit", name: "Unidad", factor: 1, price: 120, wholesalePrice: null, sortOrder: 1 },
    ];
    vi.mocked(enablePresentations).mockResolvedValue(created);
    vi.mocked(replacePresentations).mockResolvedValue(created);
    const { result, onChanged } = setup([]);
    act(() => result.current.addRow());
    act(() =>
      result.current.updateRow(result.current.rows[1].key, { name: "Caja", factor: "10", price: "1000" }),
    );
    await act(async () => { await result.current.enable("Caja"); });
    expect(onChanged).toHaveBeenCalledWith(created);
    expect(result.current.rows.map((r) => r.id)).toEqual(["s-box", "s-unit"]);
    await act(async () => { await result.current.save(); });
    const sent = vi.mocked(replacePresentations).mock.calls[0][1];
    expect(sent.map((r) => r.id)).toEqual(["s-box", "s-unit"]);
  });

  it("enable validates first (no second presentation is fine, duplicate is not)", async () => {
    const { result } = setup([]);
    act(() => result.current.addRow());
    act(() =>
      result.current.updateRow(result.current.rows[1].key, { name: "unidad", factor: "10", price: "5" }),
    );
    await act(async () => { await result.current.enable(); });
    expect(enablePresentations).not.toHaveBeenCalled();
    expect(result.current.error).toBe(presentationErrorMessage("PRESENTATION_NAME_DUPLICATE"));
  });

  it("disable calls the API and notifies; a 409 surfaces the stock message", async () => {
    vi.mocked(disablePresentations).mockResolvedValueOnce([]);
    const { result, onChanged } = setup();
    await act(async () => { await result.current.disable(); });
    expect(disablePresentations).toHaveBeenCalledWith("p1");
    expect(onChanged).toHaveBeenCalledTimes(1);

    vi.mocked(disablePresentations).mockRejectedValueOnce(
      new PresentationsApiError("x", "PRESENTATION_STOCK_NOT_ZERO", 409),
    );
    await act(async () => { await result.current.disable(); });
    expect(result.current.error).toBe(presentationErrorMessage("PRESENTATION_STOCK_NOT_ZERO"));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});

describe("presentationErrorMessage", () => {
  it("returns distinct Spanish messages for known codes", () => {
    expect(presentationErrorMessage("PRESENTATION_STOCK_NOT_ZERO")).toMatch(/stock/i);
    expect(presentationErrorMessage("PRESENTATIONS_FARMACIA_ONLY")).toMatch(/FARMACIA/);
    expect(presentationErrorMessage("PRESENTATIONS_CATEGORY_LOCKED")).toMatch(/categor/i);
  });
  it("falls back to the provided message, then a generic one", () => {
    expect(presentationErrorMessage("UNKNOWN", "boom")).toBe("boom");
    expect(presentationErrorMessage(undefined)).toMatch(/presentaciones/i);
  });
});

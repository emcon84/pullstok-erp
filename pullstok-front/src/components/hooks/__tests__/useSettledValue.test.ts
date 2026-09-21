import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSettledValue } from "../useSettledValue";

describe("useSettledValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("arranca con el valor inicial", () => {
    const { result } = renderHook(() => useSettledValue("a", 400));
    expect(result.current[0]).toBe("a");
  });

  it("no adopta el nuevo valor hasta que pasa el delay sin cambios", () => {
    const { result, rerender } = renderHook(
      ({ v }) => useSettledValue(v, 400),
      { initialProps: { v: "a" } },
    );

    rerender({ v: "b" });
    act(() => vi.advanceTimersByTime(399));
    expect(result.current[0]).toBe("a");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe("b");
  });

  it("cada cambio reinicia la espera (solo el último valor se adopta)", () => {
    const { result, rerender } = renderHook(
      ({ v }) => useSettledValue(v, 400),
      { initialProps: { v: "a" } },
    );

    rerender({ v: "b" });
    act(() => vi.advanceTimersByTime(300));
    rerender({ v: "c" });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current[0]).toBe("a");

    act(() => vi.advanceTimersByTime(100));
    expect(result.current[0]).toBe("c");
  });

  it("flush adopta el último valor al instante", () => {
    const { result, rerender } = renderHook(
      ({ v }) => useSettledValue(v, 400),
      { initialProps: { v: "a" } },
    );

    rerender({ v: "b" });
    expect(result.current[0]).toBe("a");

    act(() => result.current[1]());
    expect(result.current[0]).toBe("b");
  });
});

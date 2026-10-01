import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScanCapture } from "@/components/hooks/useScanCapture";

// Dispara un keydown en window y devuelve el evento para inspeccionar
// defaultPrevented. cancelable=true para que preventDefault tenga efecto.
function key(k: string) {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  window.dispatchEvent(ev);
  return ev;
}

// Ráfaga de pistola: caracteres separados por gapMs + Enter.
function burst(code: string, gapMs = 10) {
  const events: KeyboardEvent[] = [];
  for (const ch of code) {
    events.push(key(ch));
    vi.advanceTimersByTime(gapMs);
  }
  events.push(key("Enter"));
  return events;
}

describe("useScanCapture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("llama onScan con el código de una ráfaga >=6 alfanuméricos + Enter", () => {
    const onScan = vi.fn();
    renderHook(() => useScanCapture({ enabled: true, onScan }));
    burst("7790001234567");
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("7790001234567");
  });

  it("acepta códigos alfanuméricos con mayúsculas (Shift ignorado)", () => {
    const onScan = vi.fn();
    renderHook(() => useScanCapture({ enabled: true, onScan }));
    key("Shift");
    key("B");
    vi.advanceTimersByTime(10);
    for (const ch of "LST12345") {
      key(ch);
      vi.advanceTimersByTime(10);
    }
    key("Enter");
    expect(onScan).toHaveBeenCalledWith("BLST12345");
  });

  it("no captura códigos de menos de 6 caracteres", () => {
    const onScan = vi.fn();
    renderHook(() => useScanCapture({ enabled: true, onScan }));
    const evs = burst("12345");
    expect(onScan).not.toHaveBeenCalled();
    expect(evs[evs.length - 1].defaultPrevented).toBe(false);
  });

  it("un gap >400ms resetea el buffer", () => {
    const onScan = vi.fn();
    renderHook(() => useScanCapture({ enabled: true, onScan }));
    for (const ch of "123456") {
      key(ch);
      vi.advanceTimersByTime(10);
    }
    vi.advanceTimersByTime(500);
    for (const ch of "789") {
      key(ch);
      vi.advanceTimersByTime(10);
    }
    key("Enter");
    expect(onScan).not.toHaveBeenCalled();
  });

  it("previene los caracteres en ráfaga (<60ms) y el Enter, pero no el primero ni el tipeo lento", () => {
    const onScan = vi.fn();
    renderHook(() => useScanCapture({ enabled: true, onScan }));
    const fast = burst("1234567", 10);
    expect(fast[0].defaultPrevented).toBe(false); // primer carácter
    expect(fast[1].defaultPrevented).toBe(true);
    expect(fast[fast.length - 1].defaultPrevented).toBe(true); // Enter

    vi.advanceTimersByTime(1000);
    const slow = key("a");
    vi.advanceTimersByTime(100);
    const slow2 = key("b");
    expect(slow.defaultPrevented).toBe(false);
    expect(slow2.defaultPrevented).toBe(false);
  });

  it("no captura nada cuando enabled es false", () => {
    const onScan = vi.fn();
    renderHook(() => useScanCapture({ enabled: false, onScan }));
    const evs = burst("7790001234567");
    expect(onScan).not.toHaveBeenCalled();
    expect(evs.every((e) => !e.defaultPrevented)).toBe(true);
  });

  it("deja de capturar al pasar de enabled a disabled y desmontar", () => {
    const onScan = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useScanCapture({ enabled, onScan }),
      { initialProps: { enabled: true } },
    );
    rerender({ enabled: false });
    burst("7790001234567");
    expect(onScan).not.toHaveBeenCalled();
    rerender({ enabled: true });
    burst("7790001234567");
    expect(onScan).toHaveBeenCalledTimes(1);
    unmount();
    burst("7790001234567");
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it("usa el onScan más reciente sin re-registrar el listener", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useScanCapture({ enabled: true, onScan: cb }), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    burst("7790001234567");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("7790001234567");
  });
});

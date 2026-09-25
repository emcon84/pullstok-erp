import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { useVendorRowsKeyboard } from "@/components/hooks/useVendorRowsKeyboard";

// Regresión: un código escaneado con letras que coinciden con atajos de una
// sola tecla (L, T, M, P, V) no debe disparar esos atajos — solo debe actuar
// cuando la tecla llega SUELTA (tipeo humano deliberado), no en ráfaga rápida
// (pistola / parte de un código más largo).

function setup(overrides: Partial<Parameters<typeof useVendorRowsKeyboard>[0]> = {}) {
  const searchInputRef = createRef<HTMLInputElement>();
  const onToggleTab = vi.fn();
  const selectFirst = vi.fn();

  renderHook(() =>
    useVendorRowsKeyboard({
      searchInputRef,
      hasRows: true,
      selectedIndex: 0,
      moveDown: vi.fn(),
      moveUp: vi.fn(),
      selectFirst,
      onIncrement: vi.fn(),
      onDecrement: vi.fn(),
      onCommitRow: vi.fn(),
      onToggleTab,
      cartItems: [],
      handleSaveOrder: vi.fn(),
      handleConfirmSale: vi.fn(),
      ...overrides,
    }),
  );

  return { onToggleTab, selectFirst };
}

describe("useVendorRowsKeyboard — colisión de atajos con un código escaneado", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("una T suelta (tecla única, no ráfaga) SÍ cambia de tab — comportamiento normal intacto", () => {
    const { onToggleTab } = setup();

    fireEvent.keyDown(window, { key: "T" });

    expect(onToggleTab).toHaveBeenCalledTimes(1);
  });

  it("la T de un código escaneado en ráfaga (BLST00004 + Enter) NO cambia de tab ni salta al listado", () => {
    const { onToggleTab, selectFirst } = setup();

    for (const ch of "BLST00004".split("")) {
      fireEvent.keyDown(window, { key: ch });
    }
    fireEvent.keyDown(window, { key: "Enter" });

    expect(onToggleTab).not.toHaveBeenCalled();
    expect(selectFirst).not.toHaveBeenCalled();
  });
});

describe("useVendorRowsKeyboard — tecla / dentro de un diálogo", () => {
  it("no roba el foco al buscador cuando se tipea '/' en un input de un diálogo (ej. nombre de producto manual)", () => {
    const searchInput = document.createElement("input");
    document.body.appendChild(searchInput);
    const focusSpy = vi.spyOn(searchInput, "focus");
    const { onToggleTab } = setup({ searchInputRef: { current: searchInput } });

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const nameInput = document.createElement("input");
    dialog.appendChild(nameInput);
    document.body.appendChild(dialog);
    nameInput.focus();

    const notPrevented = fireEvent.keyDown(nameInput, { key: "/" });

    expect(focusSpy).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true); // sin preventDefault: el '/' se escribe
    expect(onToggleTab).not.toHaveBeenCalled();

    dialog.remove();
    searchInput.remove();
  });

  it("fuera de un diálogo, '/' sigue enfocando el buscador", () => {
    const searchInput = document.createElement("input");
    document.body.appendChild(searchInput);
    const focusSpy = vi.spyOn(searchInput, "focus");
    setup({ searchInputRef: { current: searchInput } });

    fireEvent.keyDown(window, { key: "/" });

    expect(focusSpy).toHaveBeenCalled();
    searchInput.remove();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/hooks/useCashSession", () => ({
  useGetCurrentCashSession: vi.fn(),
  useOpenCashSession: vi.fn(),
  useCloseCashSession: vi.fn(),
}));

vi.mock("@/components/hooks/useBranches", () => ({
  useBranches: vi.fn(),
}));

import { CashSessionPage } from "@/views/CashSessionPage";
import {
  useGetCurrentCashSession,
  useOpenCashSession,
  useCloseCashSession,
} from "@/components/hooks/useCashSession";
import { useBranches } from "@/components/hooks/useBranches";

const mockCurrent = vi.mocked(useGetCurrentCashSession);
const mockOpen = vi.mocked(useOpenCashSession);
const mockClose = vi.mocked(useCloseCashSession);
const mockBranches = vi.mocked(useBranches);

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CashSessionPage />
    </QueryClientProvider>,
  );
}

describe("CashSessionPage — sin sesión", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(
      "user",
      JSON.stringify({ role: "CASHIER", branchIds: ["b1"] }),
    );
    mockCurrent.mockReturnValue({
      session: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    mockOpen.mockReturnValue({
      openCashSession: vi.fn(),
      loading: false,
      error: null,
      success: false,
    } as any);
    mockClose.mockReturnValue({
      closeCashSession: vi.fn(),
      loading: false,
      error: null,
      success: false,
      result: undefined,
    } as any);
    mockBranches.mockReturnValue({
      branches: [{ id: "b1", name: "Sucursal Norte" }],
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("muestra el form 'Abrir caja' cuando no hay sesión OPEN", async () => {
    renderPage();
    // "Abrir caja" aparece como título del card y como texto del botón.
    expect(screen.getAllByText("Abrir caja").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Fondo inicial ($)")).toBeInTheDocument();
  });

  it("no muestra selector de sucursal cuando hay una sola sucursal", () => {
    renderPage();
    expect(screen.queryByLabelText("Sucursal")).not.toBeInTheDocument();
  });

  it("muestra el selector de sucursal cuando hay más de una", () => {
    mockBranches.mockReturnValue({
      branches: [
        { id: "b1", name: "Norte" },
        { id: "b2", name: "Sur" },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    renderPage();
    expect(screen.getByLabelText("Sucursal")).toBeInTheDocument();
  });
});

describe("CashSessionPage — con sesión OPEN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(
      "user",
      JSON.stringify({ role: "CASHIER", branchIds: ["b1"], id: "u1" }),
    );
    mockCurrent.mockReturnValue({
      session: {
        id: "cs-1",
        status: "OPEN",
        cashierId: "u1",
        openingAmount: 5000,
        openedAt: "2026-08-20T12:00:00.000Z",
        payments: [
          { method: "EFECTIVO", amount: 1500 },
          { method: "TARJETA_CREDITO", amount: 400 },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    mockOpen.mockReturnValue({
      openCashSession: vi.fn(),
      loading: false,
      error: null,
      success: false,
    } as any);
    mockClose.mockReturnValue({
      closeCashSession: vi.fn(),
      loading: false,
      error: null,
      success: false,
      result: undefined,
    } as any);
    mockBranches.mockReturnValue({
      branches: [{ id: "b1", name: "Norte" }],
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("muestra el panel de saldo con fondo, vendido por método y esperado", () => {
    renderPage();
    expect(screen.getByText("Saldo")).toBeInTheDocument();
    // Esperado = fondo 5000 + solo EFECTIVO 1500 = 6500 (R10)
    expect(screen.getByText("$6.500,00")).toBeInTheDocument();
    expect(screen.getByText("$1.500,00")).toBeInTheDocument();
  });

  it("abre el modal de arqueo al tocar 'Cerrar / Arqueo'", () => {
    renderPage();
    fireEvent.click(screen.getAllByText("Cerrar / Arqueo")[0]);
    // "Esperado (efectivo)" aparece en el panel de saldo y en el modal.
    expect(screen.getAllByText("Esperado (efectivo)").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Efectivo")).toBeInTheDocument();
  });

  it("muestra el botón cerrar solo si el usuario abrió la caja o es gestión", () => {
    renderPage();
    // Sesión abierta por el usuario actual (cashierId === user.id) → cierre ok.
    expect(screen.getAllByText("Cerrar / Arqueo").length).toBeGreaterThan(0);
  });

  it("oculta cerrar a un cajero que no abrió la caja (compartida)", () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ role: "CASHIER", branchIds: ["b1"], id: "otro-1" }),
    );
    renderPage();
    expect(screen.queryByText("Cerrar / Arqueo")).not.toBeInTheDocument();
    expect(
      screen.getByText("Solo quien la abrió o gestión pueden cerrarla."),
    ).toBeInTheDocument();
  });
});

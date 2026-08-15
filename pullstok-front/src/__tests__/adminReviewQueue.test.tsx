import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("@/services/priceKgReview", () => ({
  listQueue: vi.fn(),
  autoApply: vi.fn(),
  approveEntry: vi.fn(),
  rejectEntry: vi.fn(),
  listProductsForCell: vi.fn(),
}));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { AdminReviewQueue } from "@/views/AdminReviewQueue";
import {
  listQueue,
  autoApply,
  approveEntry,
  rejectEntry,
} from "@/services/priceKgReview";
import { toast } from "react-toastify";

const listQueueMock = vi.mocked(listQueue);
const autoApplyMock = vi.mocked(autoApply);
const approveEntryMock = vi.mocked(approveEntry);
const rejectEntryMock = vi.mocked(rejectEntry);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

const ENTRY = {
  id: "e1",
  productId: "p1",
  productName: "PRO PLAN ADULTO PERRO 12KG",
  priceKgPriceId: "c1",
  brandName: "PRO PLAN",
  typeName: "Adulto",
  species: "PERRO",
  reason: "FUZZY_MATCH",
  status: "PENDING",
  oldPriceKg: 7500,
  newPriceKg: 9200,
  reviewedBy: null,
  appliedAt: null,
  createdAt: "2026-08-01T10:00:00Z",
};

describe("AdminReviewQueue — cola de revisión de precios por kilo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    listQueueMock.mockResolvedValue({ items: [ENTRY], total: 1, page: 1 });
    autoApplyMock.mockResolvedValue({ applied: 2, queued: 1, skipped: 0 });
    approveEntryMock.mockResolvedValue({ success: true });
    rejectEntryMock.mockResolvedValue({ success: true });
  });

  it("lista las entradas PENDING con producto, marca, tipo, especie, precios y motivo", async () => {
    render(<AdminReviewQueue />);

    expect(await screen.findByText("PRO PLAN ADULTO PERRO 12KG")).toBeInTheDocument();
    // Marca · Tipo en una sola celda; "PRO PLAN" aparece también en el nombre
    // del producto, así que usamos getAllByText para el par marca·tipo.
    expect(screen.getAllByText(/PRO PLAN · Adulto/).length).toBeGreaterThan(0);
    expect(screen.getByText("Perro")).toBeInTheDocument();
    // Precio viejo → nuevo
    expect(screen.getByText(/\$7\.500/)).toBeInTheDocument();
    expect(screen.getByText(/\$9\.200/)).toBeInTheDocument();
    expect(screen.getByText("Coincidencia difusa")).toBeInTheDocument();

    expect(listQueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING" }),
    );
  });

  it("aprueba una entrada: llama approveEntry y refresca con toast", async () => {
    render(<AdminReviewQueue />);
    await screen.findByText("PRO PLAN ADULTO PERRO 12KG");

    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));

    await waitFor(() => expect(approveEntryMock).toHaveBeenCalledWith("e1"));
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("rechaza una entrada: llama rejectEntry y refresca con toast", async () => {
    render(<AdminReviewQueue />);
    await screen.findByText("PRO PLAN ADULTO PERRO 12KG");

    fireEvent.click(screen.getByRole("button", { name: /rechazar/i }));

    await waitFor(() => expect(rejectEntryMock).toHaveBeenCalledWith("e1"));
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("'Aplicar precios de planilla' corre autoApply y muestra el resumen", async () => {
    render(<AdminReviewQueue />);
    await screen.findByText("PRO PLAN ADULTO PERRO 12KG");

    fireEvent.click(
      screen.getByRole("button", { name: /aplicar precios de planilla/i }),
    );

    await waitFor(() => expect(autoApplyMock).toHaveBeenCalled());
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("2"),
    );
  });

  it("cola vacía muestra el estado vacío", async () => {
    listQueueMock.mockResolvedValue({ items: [], total: 0, page: 1 });
    render(<AdminReviewQueue />);

    expect(await screen.findByText(/sin entradas/i)).toBeInTheDocument();
  });
});
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => mockNavigate,
}));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/priceLists", () => ({
  getPriceLists: vi.fn(),
}));

import { PriceListList } from "@/views/PriceListList";
import { getPriceLists } from "@/services/priceLists";
import type { PriceListSummary } from "@/services/priceLists";

const mockGet = vi.mocked(getPriceLists);

const items: PriceListSummary[] = [
  {
    id: "pl-1",
    provider: "ALICAN",
    type: "SECO",
    period: "2026-08-10",
    sourceFilename: "alican-seco.pdf",
    importedAt: "2026-08-10T10:00:00Z",
    sectionsCount: 3,
    entriesCount: 120,
  },
  {
    id: "pl-2",
    provider: "ALICAN",
    type: "WET",
    period: "2026-08-12",
    sourceFilename: "alican-wet.pdf",
    importedAt: "2026-08-12T10:00:00Z",
    sectionsCount: 1,
    entriesCount: 40,
  },
];

describe("PriceListList — listado de planillas guardadas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ items });
  });

  it("muestra las planillas y enlaza cada fila al detalle", async () => {
    render(<PriceListList />);

    expect(await screen.findByText("alican-seco.pdf")).toBeInTheDocument();
    expect(screen.getByText("alican-wet.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("ALICAN").length).toBe(2);

    const link = screen.getByRole("link", {
      name: /ver detalle de planilla alican-seco\.pdf/i,
    });
    expect(link).toHaveAttribute("href", "/planilla-mayorista/pl-1");
  });

  it("muestra el estado vacío cuando no hay planillas", async () => {
    mockGet.mockResolvedValue({ items: [] });
    render(<PriceListList />);

    expect(
      await screen.findByText(/no hay planillas guardadas/i),
    ).toBeInTheDocument();
  });

  it("muestra un mensaje de error cuando falla la carga", async () => {
    mockGet.mockRejectedValue(new Error("Error al listar las planillas"));
    render(<PriceListList />);

    expect(
      await screen.findByText(/error al listar las planillas/i),
    ).toBeInTheDocument();
  });

  it("navega al wizard de importación desde el botón", async () => {
    render(<PriceListList />);
    await screen.findByText("alican-seco.pdf");
    fireEvent.click(screen.getByRole("button", { name: /importar nueva planilla/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/planilla-mayorista/importar");
  });
});

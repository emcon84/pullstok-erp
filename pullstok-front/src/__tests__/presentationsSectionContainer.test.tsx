import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
import { PresentationsSectionContainer } from "@/components/organisms/PresentationsSection/PresentationsSectionContainer";

const box = { id: "a", name: "Caja", factor: 10, price: 1000, wholesalePrice: 800, sortOrder: 0 };
const unit = { id: "b", name: "Unidad", factor: 1, price: 120, wholesalePrice: null, sortOrder: 1 };

const renderContainer = (product: Record<string, unknown>) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <PresentationsSectionContainer product={product as never} />
    </QueryClientProvider>,
  );
  return { invalidate, client };
};

const enabledProduct = { _id: "p1", name: "Ibu", price: 120, quantity: 30, hasPresentations: true, presentations: [box, unit] };
const legacyProduct = { _id: "p1", name: "Ibu", price: 120, quantity: 3, hasPresentations: false, presentations: [] };

beforeEach(() => vi.clearAllMocks());

describe("PresentationsSectionContainer", () => {
  it("shows the product's presentations and saves the edits via replace, refreshing the lists", async () => {
    vi.mocked(replacePresentations).mockResolvedValue([box, unit]);
    const { invalidate } = renderContainer(enabledProduct);
    expect(screen.getByLabelText("Nombre de presentación 1")).toHaveValue("Caja");
    fireEvent.change(screen.getByLabelText("Precio de presentación 1"), { target: { value: "1100" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar presentaciones" }));
    await waitFor(() => expect(replacePresentations).toHaveBeenCalledTimes(1));
    expect(vi.mocked(replacePresentations).mock.calls[0][0]).toBe("p1");
    expect(vi.mocked(replacePresentations).mock.calls[0][1][0]).toMatchObject({ id: "a", price: 1100 });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["products"] }));
  });

  it("enable flow: quick setup in the dialog, then switches to the enabled editor", async () => {
    const created = [
      { id: "s0", name: "Caja", factor: 40, price: 2000, wholesalePrice: null, sortOrder: 0 },
      { id: "s2", name: "Pastilla", factor: 1, price: 120, wholesalePrice: null, sortOrder: 2 },
    ];
    vi.mocked(enablePresentations).mockResolvedValue(created);
    renderContainer(legacyProduct);
    expect(screen.queryByLabelText("Nombre de presentación 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Habilitar presentaciones" }));
    fireEvent.change(await screen.findByLabelText("Blisters por caja"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Pastillas por blister"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Precio de Caja"), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText("Precio de Blister"), { target: { value: "250" } });
    expect(screen.getByText("Stock actual 3 → 120 unidades base")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(enablePresentations).toHaveBeenCalledTimes(1));
    const [id, set, counted] = vi.mocked(enablePresentations).mock.calls[0];
    expect(id).toBe("p1");
    expect(counted).toBe("Caja");
    expect(set.map((p) => [p.name, p.factor, p.price])).toEqual([
      ["Caja", 40, 2000],
      ["Blister", 10, 250],
      ["Pastilla", 1, 120],
    ]);
    expect(await screen.findByRole("button", { name: "Guardar presentaciones" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre de presentación 1")).toHaveValue("Caja");
  });

  it("prefills the Blister price from a legacy '<name> (Blister)' product already in the products cache", async () => {
    const { client } = renderContainer(legacyProduct);
    client.setQueryData(["products", "x"], [
      { _id: "z", name: "otro", price: 1 },
      { _id: "l", name: " ibu (blister) ", price: 275 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Habilitar presentaciones" }));
    expect(await screen.findByLabelText("Precio de Blister")).toHaveValue(275);
    expect(screen.getByText(/Precio tomado de «ibu \(blister\)»/)).toBeInTheDocument();
  });

  it("finds the legacy product in an infinite-query cache too, and leaves Blister empty when absent", async () => {
    const { client } = renderContainer(legacyProduct);
    client.setQueryData(["products", "inf"], { pages: [{ items: [{ _id: "l", name: "Ibu (Blister)", price: 310 }] }] });
    fireEvent.click(screen.getByRole("button", { name: "Habilitar presentaciones" }));
    expect(await screen.findByLabelText("Precio de Blister")).toHaveValue(310);
  });

  it("leaves Blister empty without a legacy match", async () => {
    renderContainer(legacyProduct);
    fireEvent.click(screen.getByRole("button", { name: "Habilitar presentaciones" }));
    expect(await screen.findByLabelText("Precio de Blister")).toHaveValue(null);
  });

  it("disable shows the 409 stock message", async () => {
    vi.mocked(disablePresentations).mockRejectedValue(
      new PresentationsApiError("x", "PRESENTATION_STOCK_NOT_ZERO", 409),
    );
    renderContainer(enabledProduct);
    fireEvent.click(screen.getByRole("button", { name: "Deshabilitar presentaciones" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("mientras haya stock");
  });

  it("disable success returns to the enable action", async () => {
    vi.mocked(disablePresentations).mockResolvedValue([]);
    renderContainer(enabledProduct);
    fireEvent.click(screen.getByRole("button", { name: "Deshabilitar presentaciones" }));
    expect(await screen.findByRole("button", { name: "Habilitar presentaciones" })).toBeInTheDocument();
  });
});

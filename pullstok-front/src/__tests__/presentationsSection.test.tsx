import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PresentationsSection } from "@/components/organisms/PresentationsSection";
import { EnablePresentationsDialog } from "@/components/molecules/EnablePresentationsDialog";
import type { PresentationRow } from "@/components/hooks/usePresentationsEditor";

const rows: PresentationRow[] = [
  { key: "k1", id: "a", name: "Caja", factor: "10", price: "1000", wholesalePrice: "800" },
  { key: "k2", id: "b", name: "Unidad", factor: "1", price: "120", wholesalePrice: "", base: true },
];

const handlers = () => ({
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onMove: vi.fn(),
  onChange: vi.fn(),
  onSave: vi.fn(),
  onRequestEnable: vi.fn(),
  onDisable: vi.fn(),
});

const renderSection = (over: Partial<React.ComponentProps<typeof PresentationsSection>> = {}) => {
  const h = handlers();
  render(
    <PresentationsSection
      enabled
      rows={rows}
      error={null}
      busy={false}
      isBase={(r) => r.base === true}
      {...h}
      {...over}
    />,
  );
  return h;
};

describe("PresentationsSection", () => {
  it("renders one editable row per presentation with its values", () => {
    renderSection();
    expect(screen.getByLabelText("Nombre de presentación 1")).toHaveValue("Caja");
    expect(screen.getByLabelText("Factor de presentación 1")).toHaveValue(10);
    expect(screen.getByLabelText("Precio de presentación 1")).toHaveValue(1000);
    expect(screen.getByLabelText("Precio mayorista de presentación 1")).toHaveValue(800);
    expect(screen.getByLabelText("Nombre de presentación 2")).toHaveValue("Unidad");
    expect(screen.getByLabelText("Precio mayorista de presentación 2")).toHaveValue(null);
  });

  it("locks the base row: factor disabled and no remove button", () => {
    renderSection();
    expect(screen.getByLabelText("Factor de presentación 2")).toBeDisabled();
    expect(screen.getByLabelText("Factor de presentación 1")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Quitar presentación 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar presentación 2" })).not.toBeInTheDocument();
  });

  it("reports edits, add, remove and reorder with the row key", () => {
    const h = renderSection();
    fireEvent.change(screen.getByLabelText("Nombre de presentación 1"), { target: { value: "Caja x10" } });
    expect(h.onChange).toHaveBeenCalledWith("k1", { name: "Caja x10" });
    fireEvent.change(screen.getByLabelText("Precio de presentación 1"), { target: { value: "1500" } });
    expect(h.onChange).toHaveBeenCalledWith("k1", { price: "1500" });
    fireEvent.click(screen.getByRole("button", { name: "Agregar presentación" }));
    expect(h.onAdd).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Quitar presentación 1" }));
    expect(h.onRemove).toHaveBeenCalledWith("k1");
    fireEvent.click(screen.getByRole("button", { name: "Bajar presentación 1" }));
    expect(h.onMove).toHaveBeenCalledWith("k1", 1);
    fireEvent.click(screen.getByRole("button", { name: "Subir presentación 2" }));
    expect(h.onMove).toHaveBeenCalledWith("k2", -1);
  });

  it("enabled: offers save and disable, not enable", () => {
    const h = renderSection();
    expect(screen.queryByRole("button", { name: "Habilitar presentaciones" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar presentaciones" }));
    expect(h.onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Deshabilitar presentaciones" }));
    expect(h.onDisable).toHaveBeenCalledTimes(1);
  });

  it("not enabled: offers enable only, without the row editor", () => {
    const h = renderSection({ enabled: false });
    expect(screen.queryByLabelText("Nombre de presentación 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar presentación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar presentaciones" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deshabilitar presentaciones" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Habilitar presentaciones" }));
    expect(h.onRequestEnable).toHaveBeenCalledTimes(1);
  });

  it("shows the error message in an alert and disables actions while busy", () => {
    renderSection({ error: "No se pueden deshabilitar las presentaciones mientras haya stock", busy: true });
    expect(screen.getByRole("alert")).toHaveTextContent("mientras haya stock");
    expect(screen.getByRole("button", { name: "Guardar presentaciones" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deshabilitar presentaciones" })).toBeDisabled();
  });
});

describe("EnablePresentationsDialog — quick setup", () => {
  const renderDialog = (over: Partial<React.ComponentProps<typeof EnablePresentationsDialog>> = {}) => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <EnablePresentationsDialog
        open
        onOpenChange={onOpenChange}
        currentStock={3}
        basePrice={30}
        legacyBlister={null}
        busy={false}
        error={null}
        onConfirm={onConfirm}
        {...over}
      />,
    );
    return { onConfirm, onOpenChange };
  };
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const fill = () => {
    type("Blisters por caja", "4");
    type("Pastillas por blister", "10");
    type("Precio de Caja", "2000");
    type("Precio de Blister", "250");
  };

  it("previews the base-unit conversion with the Caja default (blisters x pills)", () => {
    renderDialog();
    fill();
    expect(screen.getByRole("radio", { name: /Caja/ })).toBeChecked();
    expect(screen.getByText("Stock actual 3 → 120 unidades base")).toBeInTheDocument();
  });

  it("changes the preview when counting in another presentation", () => {
    renderDialog();
    fill();
    fireEvent.click(screen.getByRole("radio", { name: /Blister/ }));
    expect(screen.getByText("Stock actual 3 → 30 unidades base")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Pastilla/ }));
    expect(screen.getByText("Stock actual 3 → 3 unidades base")).toBeInTheDocument();
  });

  it("prefills the Pastilla price from the product price and leaves Blister empty without a legacy match", () => {
    renderDialog();
    expect(screen.getByLabelText("Precio de Pastilla")).toHaveValue(30);
    expect(screen.getByLabelText("Precio de Blister")).toHaveValue(null);
    expect(screen.queryByText(/Precio tomado de/)).not.toBeInTheDocument();
  });

  it("prefills the Blister price from the legacy duplicate and shows the hint", () => {
    renderDialog({ legacyBlister: { name: "Ibu (Blister)", price: 250 } });
    expect(screen.getByLabelText("Precio de Blister")).toHaveValue(250);
    expect(screen.getByText("Precio tomado de «Ibu (Blister)»")).toBeInTheDocument();
  });

  it("confirms with the built set (prices exactly as typed) and the counted-in name", () => {
    const { onConfirm } = renderDialog({ legacyBlister: { name: "Ibu (Blister)", price: 250 } });
    type("Blisters por caja", "4");
    type("Pastillas por blister", "10");
    type("Precio de Caja", "2000");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [set, counted] = onConfirm.mock.calls[0];
    expect(counted).toBe("Caja");
    expect(set.map((p: { name: string; factor: number; price: number }) => [p.name, p.factor, p.price])).toEqual([
      ["Caja", 40, 2000],
      ["Blister", 10, 250],
      ["Pastilla", 1, 30],
    ]);
  });

  it("does not confirm invalid counts: shows an alert instead", () => {
    const { onConfirm } = renderDialog();
    type("Blisters por caja", "0");
    type("Pastillas por blister", "10");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("entero");
  });

  it("shows the server error and disables confirm while busy", () => {
    renderDialog({ error: "La presentación elegida no es válida", busy: true });
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("no es válida");
    expect(screen.getByRole("button", { name: "Habilitando..." })).toBeDisabled();
  });
});

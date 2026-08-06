import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BusinessHoursForm } from "@/components/molecules/BusinessHoursForm";
import { BusinessHoursSettings } from "@/services/businessHoursService";

/**
 * Local validation mirroring the server Zod (REQ-2): the form MUST block a
 * submit with zero enabled days or open >= close BEFORE any PUT happens.
 */
const disabledDay = (day: number) => ({
  day,
  enabled: false,
  open: "09:00",
  close: "19:00",
});

const sevenDays = [
  disabledDay(0),
  disabledDay(1),
  disabledDay(2),
  disabledDay(3),
  disabledDay(4),
  disabledDay(5),
  disabledDay(6),
];

const baseSettings: BusinessHoursSettings = {
  timezone: "America/Argentina/Buenos_Aires",
  days: sevenDays,
};

function renderForm(settings: BusinessHoursSettings | null = baseSettings) {
  const onSave = vi.fn();
  render(
    <BusinessHoursForm
      settings={settings}
      loading={false}
      saving={false}
      onSave={onSave}
    />,
  );
  return { onSave };
}

describe("BusinessHoursForm — validación local", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza los 7 días con sus switch e inputs de hora", () => {
    renderForm();

    expect(screen.getByText("Domingo")).toBeInTheDocument();
    expect(screen.getByText("Lunes")).toBeInTheDocument();
    expect(screen.getByText("Martes")).toBeInTheDocument();
    expect(screen.getByText("Miércoles")).toBeInTheDocument();
    expect(screen.getByText("Jueves")).toBeInTheDocument();
    expect(screen.getByText("Viernes")).toBeInTheDocument();
    expect(screen.getByText("Sábado")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(7);
  });

  it("bloquea el submit cuando ningún día está habilitado (>=1 enabled)", () => {
    const { onSave } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));

    expect(
      screen.getByText(/Habilitá al menos un día/),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("bloquea el submit cuando open >= close en un día habilitado", () => {
    const badSettings: BusinessHoursSettings = {
      timezone: "America/Argentina/Buenos_Aires",
      days: sevenDays.map((d, i) =>
        i === 1 ? { day: 1, enabled: true, open: "19:00", close: "09:00" } : d,
      ),
    };
    const { onSave } = renderForm(badSettings);
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));

    expect(
      screen.getByText(/La apertura debe ser anterior al cierre en Lunes/),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("llama onSave con timezone + days cuando la config es válida", () => {
    const validSettings: BusinessHoursSettings = {
      timezone: "America/Argentina/Buenos_Aires",
      days: sevenDays.map((d, i) =>
        i === 1 ? { day: 1, enabled: true, open: "09:00", close: "19:00" } : d,
      ),
    };
    const { onSave } = renderForm(validSettings);
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));

    expect(onSave).toHaveBeenCalledWith(validSettings);
  });

  it("limpia el error previo cuando el segundo submit ya es válido", () => {
    const { onSave } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));
    expect(screen.getByText(/Habilitá al menos un día/)).toBeInTheDocument();

    // Habilitamos Lunes con horario válido y reintentamos.
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));

    expect(screen.queryByText(/Habilitá al menos un día/)).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("permite editar horarios con el input de tipo time", () => {
    renderForm();
    const openInput = screen.getByLabelText("Hora de apertura Lunes");
    expect(openInput).toHaveAttribute("type", "time");
    expect(openInput).toHaveValue("09:00");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BusinessHoursForm } from "@/components/molecules/BusinessHoursForm";
import { BusinessHoursSettings } from "@/services/businessHoursService";

/**
 * Local validation mirroring the server Zod (REQ-2): the form MUST block a
 * submit with zero enabled days, an enabled day without slots, or a slot
 * where open >= close BEFORE any PUT happens. Multi-slot days (horario
 * cortado) are the core scenario.
 */
const disabledDay = (day: number) => ({
  day,
  enabled: false,
  slots: [{ open: "09:00", close: "19:00" }],
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

const withEnabled = (
  dayIndex: number,
  day: Partial<ReturnType<typeof disabledDay>> = {},
) => ({
  ...baseSettings,
  days: sevenDays.map((d, i) =>
    i === dayIndex ? { ...d, ...day, enabled: true } : d,
  ),
});

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
    const { onSave } = renderForm(
      withEnabled(1, { slots: [{ open: "19:00", close: "09:00" }] }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));

    expect(
      screen.getByText(/La apertura debe ser anterior al cierre en Lunes/),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("llama onSave con timezone + days cuando la config es válida", () => {
    const validSettings = withEnabled(1);
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
    const openInput = screen.getByLabelText("Apertura turno 1 Lunes");
    expect(openInput).toHaveAttribute("type", "time");
    expect(openInput).toHaveValue("09:00");
  });
});

describe("BusinessHoursForm — horario cortado (múltiples turnos)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("agrega un segundo turno a un día habilitado", () => {
    const { onSave } = renderForm(withEnabled(1));
    fireEvent.click(screen.getByRole("button", { name: "+ Agregar turno" }));

    // Segundo turno visible con su propia etiqueta.
    expect(screen.getByLabelText("Apertura turno 2 Lunes")).toHaveValue("09:00");

    // El submit envía los 2 turnos (08:00-12:00 y 16:00-20:00).
    const open1 = screen.getByLabelText("Apertura turno 1 Lunes");
    const close1 = screen.getByLabelText("Cierre turno 1 Lunes");
    const open2 = screen.getByLabelText("Apertura turno 2 Lunes");
    const close2 = screen.getByLabelText("Cierre turno 2 Lunes");

    fireEvent.change(open1, { target: { value: "08:00" } });
    fireEvent.change(close1, { target: { value: "12:00" } });
    fireEvent.change(open2, { target: { value: "16:00" } });
    fireEvent.change(close2, { target: { value: "20:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));

    const saved = onSave.mock.calls[0][0] as BusinessHoursSettings;
    const lunes = saved.days[1];
    expect(lunes.enabled).toBe(true);
    expect(lunes.slots).toEqual([
      { open: "08:00", close: "12:00" },
      { open: "16:00", close: "20:00" },
    ]);
  });

  it("quita un turno y el submit envía solo los restantes", () => {
    const { onSave } = renderForm(
      withEnabled(1, {
        slots: [
          { open: "08:00", close: "12:00" },
          { open: "16:00", close: "20:00" },
        ],
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Quitar turno 2 Lunes" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));
    const saved = onSave.mock.calls[0][0] as BusinessHoursSettings;
    expect(saved.days[1].slots).toEqual([{ open: "08:00", close: "12:00" }]);
  });

  it("bloquea el submit cuando un turno del horario cortado es inválido", () => {
    const { onSave } = renderForm(
      withEnabled(1, {
        slots: [
          { open: "08:00", close: "12:00" },
          { open: "20:00", close: "16:00" }, // inverso → inválido
        ],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));

    expect(
      screen.getByText(/La apertura debe ser anterior al cierre en Lunes/),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("bloquea el submit si un día habilitado queda sin turnos", () => {
    const { onSave } = renderForm(
      withEnabled(1, {
        slots: [
          { open: "08:00", close: "12:00" },
          { open: "16:00", close: "20:00" },
        ],
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Quitar turno 2 Lunes" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Quitar turno 1 Lunes" }));

    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));

    expect(
      screen.getByText(/habilitado pero no tiene ningún turno/),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("re-siembra el turno default al habilitar un día que llegó sin slots", () => {
    const { onSave } = renderForm({
      timezone: "America/Argentina/Buenos_Aires",
      days: sevenDays.map((d, i) =>
        i === 1 ? { day: 1, enabled: true, slots: [] } : d,
      ),
    });
    // El form muestra el día sin turnos; al re-habilitarlo tras un toggle
    // off/on, vuelve el slot default.
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]); // off
    fireEvent.click(switches[1]); // on

    expect(screen.getByLabelText("Apertura turno 1 Lunes")).toHaveValue("09:00");
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario" }));
    const saved = onSave.mock.calls[0][0] as BusinessHoursSettings;
    expect(saved.days[1].slots).toEqual([{ open: "09:00", close: "19:00" }]);
  });
});

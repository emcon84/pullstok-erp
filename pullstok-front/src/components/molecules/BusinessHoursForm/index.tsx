import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BusinessHoursDay,
  BusinessHoursSettings,
  BusinessHourSlot,
} from "../../../services/businessHoursService";
import { Loader } from "../../atoms/loader";

// Días de la semana en español, 0(domingo)..6(sábado) — mismo orden que el
// backend (businessHourSetting.days es un Json 7× {day, enabled, slots}).
const DAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

// Slot por defecto: un único turno diurno (09:00-19:00), el valor histórico
// del ERP antes del soporte de horario cortado.
const DEFAULT_SLOTS: BusinessHourSlot[] = [{ open: "09:00", close: "19:00" }];

// Fallback del cliente: si la API no devuelve días (error o respuesta
// incompleta), el form igual muestra los 7 días deshabilitados en vez de una
// card vacía. El PUT valida que al menos uno quede enabled.
const DEFAULT_DAYS: BusinessHoursDay[] = Array.from({ length: 7 }, (_, day) => ({
  day,
  enabled: false,
  slots: DEFAULT_SLOTS.map((s) => ({ ...s })),
}));

// Normaliza días legacy o incompletos al shape actual. Un día servido con el
// formato viejo { open, close } (sin slots) se migra a un único turno y se
// descartan las claves legacy; un día sin ninguna de las dos formas cae al slot
// default. Sin esto, un día sin `slots` rompe el render con `d.slots.length`
// (TypeError de producción) y el PUT arrastra open/close muertos.
const normalizeDays = (days: BusinessHoursDay[] | undefined): BusinessHoursDay[] => {
  if (!days?.length) return DEFAULT_DAYS;
  return days.map((d) => {
    if (d.slots?.length) return d;
    const { open, close, ...rest } = d as BusinessHoursDay & {
      open?: string;
      close?: string;
    };
    return {
      ...rest,
      slots: [{ open: open || "09:00", close: close || "19:00" }],
    };
  });
};

interface BusinessHoursFormProps {
  settings: BusinessHoursSettings | null;
  loading: boolean;
  saving: boolean;
  loadError?: string | null;
  onSave: (data: BusinessHoursSettings) => void;
}

export const BusinessHoursForm = ({
  settings,
  loading,
  saving,
  loadError,
  onSave,
}: BusinessHoursFormProps) => {
  const [timezone, setTimezone] = useState(
    settings?.timezone ?? "America/Argentina/Buenos_Aires",
  );
  const [days, setDays] = useState<BusinessHoursDay[]>(
    normalizeDays(settings?.days),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setTimezone(settings.timezone);
      setDays(normalizeDays(settings.days));
      setError(null);
    }
  }, [settings]);

  // Zonas soportadas por el runtime (listas canónicas + alias que el server
  // acepta vía Intl.DateTimeFormat). Si el runtime no las expone, el Select
  // queda vacío pero el form sigue siendo útil para editar días; el server
  // sigue validando la timezone en el PUT.
  const supportedTimezones = useMemo(() => {
    const intlAny = Intl as unknown as {
      supportedValuesOf?: (key: "timeZone") => string[];
    };
    let zones: string[] = [];
    try {
      zones = intlAny.supportedValuesOf
        ? intlAny.supportedValuesOf("timeZone")
        : [];
    } catch {
      zones = [];
    }
    // Garantía: la zona por defecto del ERP (Buenos Aires) siempre aparecerá
    // en el selector aunque el runtime no la liste con supportedValuesOf.
    const DEFAULT_TZ = "America/Argentina/Buenos_Aires";
    if (!zones.includes(DEFAULT_TZ)) {
      zones = [DEFAULT_TZ, ...zones];
    }
    return zones;
  }, []);

  const toggleDay = (index: number, enabled: boolean) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i === index
          ? {
              ...d,
              enabled,
              // Un día habilitado necesita al menos un turno (requisito del
              // schema: slots min(1)); si llega sin slots, se siembra el default.
              slots: d.slots.length
                ? d.slots
                : DEFAULT_SLOTS.map((s) => ({ ...s })),
            }
          : d,
      ),
    );
  };

  const updateSlot = (
    dayIndex: number,
    slotIndex: number,
    field: "open" | "close",
    value: string,
  ) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? {
              ...d,
              slots: d.slots.map((s, j) =>
                j === slotIndex ? { ...s, [field]: value } : s,
              ),
            }
          : d,
      ),
    );
  };

  const addSlot = (dayIndex: number) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex ? { ...d, slots: [...d.slots, { open: "09:00", close: "19:00" }] } : d,
      ),
    );
  };

  const removeSlot = (dayIndex: number, slotIndex: number) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? { ...d, slots: d.slots.filter((_, j) => j !== slotIndex) }
          : d,
      ),
    );
  };

  // Validación local ESTRICTA, espejo de la Zod del server (REQ-2): al menos
  // un día habilitado; cada día habilitado con >= 1 turno; y en cada turno
  // open < close (string compare zero-padded, "09:00" < "19:00" es correcto).
  // Se ejecuta ANTES de tocar el server — un submit inválido nunca llega a PUT.
  const validate = (): string | null => {
    if (!days.some((d) => d.enabled)) {
      return "Habilitá al menos un día para poder guardar.";
    }
    for (const d of days) {
      if (!d.enabled) continue;
      if (!d.slots.length) {
        return `El día ${DAY_LABELS[d.day]} está habilitado pero no tiene ningún turno.`;
      }
      for (const s of d.slots) {
        if (s.open >= s.close) {
          return `La apertura debe ser anterior al cierre en ${DAY_LABELS[d.day]}.`;
        }
      }
    }
    return null;
  };

  const handleSave = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onSave({ timezone, days });
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  // Si la carga de la config falló, mostrarlo en vez de renderizar un form
  // vacío que parece roto (fue el bug que reportaste: query 404 + card sin días).
  if (loadError && !settings) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          No se pudo cargar la configuración del horario comercial: {loadError}
        </div>
        <Button
          onClick={() => window.location.reload()}
          variant="outline"
          className="w-full"
        >
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="timezone">Zona horaria</Label>
          <p className="text-xs text-muted-foreground">
            El horario se resuelve en la zona del comercio. Fuera de este
            horario, los roles operativos no podrán operar.
          </p>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="timezone" aria-label="Zona horaria" className="w-full">
              <SelectValue placeholder="Elegí la zona horaria" />
            </SelectTrigger>
            <SelectContent>
              {supportedTimezones.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold tracking-tight">
            Días y horarios
          </h3>
          <p className="text-xs text-muted-foreground">
            Cada día puede tener uno o más turnos (ej. 08:00-12:00 y
            16:00-20:00). Los días deshabilitados quedan fuera del horario
            (bloquean a los roles operativos).
          </p>
        </div>

        {days.map((d, dayIndex) => (
          <div
            key={d.day}
            className="space-y-3 rounded-lg border p-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Switch
                  id={`enabled-${d.day}`}
                  checked={d.enabled}
                  onCheckedChange={(checked) => toggleDay(dayIndex, checked)}
                />
                <Label htmlFor={`enabled-${d.day}`} className="min-w-20">
                  {DAY_LABELS[d.day]}
                </Label>
              </div>
              {d.enabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addSlot(dayIndex)}
                >
                  + Agregar turno
                </Button>
              )}
            </div>

            <div
              className={`space-y-2 ${d.enabled ? "" : "pointer-events-none opacity-40"}`}
            >
              {d.slots.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Sin turnos — habilitá el día y agregá al menos un turno.
                </p>
              )}
              {d.slots.map((slot, slotIndex) => (
                <div
                  key={slotIndex}
                  className="flex items-center gap-2"
                >
                  <span className="text-xs text-muted-foreground">
                    Turno {slotIndex + 1}
                  </span>
                  <Input
                    type="time"
                    aria-label={`Apertura turno ${slotIndex + 1} ${DAY_LABELS[d.day]}`}
                    value={slot.open}
                    onChange={(e) =>
                      updateSlot(dayIndex, slotIndex, "open", e.target.value)
                    }
                    className="w-32"
                  />
                  <span className="text-muted-foreground">a</span>
                  <Input
                    type="time"
                    aria-label={`Cierre turno ${slotIndex + 1} ${DAY_LABELS[d.day]}`}
                    value={slot.close}
                    onChange={(e) =>
                      updateSlot(dayIndex, slotIndex, "close", e.target.value)
                    }
                    className="w-32"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSlot(dayIndex, slotIndex)}
                    aria-label={`Quitar turno ${slotIndex + 1} ${DAY_LABELS[d.day]}`}
                  >
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando..." : "Guardar horario"}
        </Button>
      </div>
    </div>
  );
};

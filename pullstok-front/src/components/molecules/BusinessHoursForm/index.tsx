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
  BusinessHoursSettings,
} from "../../../services/businessHoursService";
import { Loader } from "../../atoms/loader";

// Días de la semana en español, 0(domingo)..6(sábado) — mismo orden que el
// backend (businessHourSetting.days es un Json 7× {day, enabled, open, close}).
const DAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

interface BusinessHoursFormProps {
  settings: BusinessHoursSettings | null;
  loading: boolean;
  saving: boolean;
  onSave: (data: BusinessHoursSettings) => void;
}

export const BusinessHoursForm = ({
  settings,
  loading,
  saving,
  onSave,
}: BusinessHoursFormProps) => {
  const [timezone, setTimezone] = useState(
    settings?.timezone ?? "America/Argentina/Buenos_Aires",
  );
  const [days, setDays] = useState(settings?.days ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setTimezone(settings.timezone);
      setDays(settings.days);
      setError(null);
    }
  }, [settings]);

  // Zonas soportadas por el runtime (listas canónicas + alias que el server
  // acepta vía Intl.DateTimeFormat). Si el runtime no las expone, el Select
  // queda vacío pero el form sigue siendo útil para editar días; el server
  // sigue validando la timezone en el PUT.
  const supportedTimezones = useMemo(() => {
    try {
      const intlAny = Intl as unknown as {
        supportedValuesOf?: (key: "timeZone") => string[];
      };
      if (!intlAny.supportedValuesOf) return [];
      return intlAny.supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  }, []);

  const toggleDay = (index: number, enabled: boolean) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i === index ? { ...d, enabled, open: d.open || "09:00", close: d.close || "19:00" } : d,
      ),
    );
  };

  const updateDay = (
    index: number,
    field: "open" | "close",
    value: string,
  ) => {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  };

  // Validación local ESTRICTA, espejo de la Zod del server (REQ-2): al menos
  // un día habilitado y open < close (string compare zero-padded, "09:00" <
  // "19:00" es correcto). Se ejecuta ANTES de tocar el server — un submit
  // inválido nunca llega a PUT.
  const validate = (): string | null => {
    if (!days.some((d) => d.enabled)) {
      return "Habilitá al menos un día para poder guardar.";
    }
    for (const d of days) {
      if (d.enabled && d.open >= d.close) {
        return `La apertura debe ser anterior al cierre en ${DAY_LABELS[d.day]}.`;
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
            Los días deshabilitados quedan fuera del horario (bloquean a los
            roles operativos).
          </p>
        </div>

        {days.map((d, index) => (
          <div
            key={d.day}
            className="flex items-center justify-between gap-4 rounded-lg border p-3"
          >
            <div className="flex items-center gap-3">
              <Switch
                id={`enabled-${d.day}`}
                checked={d.enabled}
                onCheckedChange={(checked) => toggleDay(index, checked)}
              />
              <Label htmlFor={`enabled-${d.day}`} className="min-w-20">
                {DAY_LABELS[d.day]}
              </Label>
            </div>
            <div
              className={`flex items-center gap-2 ${d.enabled ? "" : "pointer-events-none opacity-40"}`}
            >
              <Input
                type="time"
                aria-label={`Hora de apertura ${DAY_LABELS[d.day]}`}
                value={d.open}
                onChange={(e) => updateDay(index, "open", e.target.value)}
                className="w-32"
              />
              <span className="text-muted-foreground">a</span>
              <Input
                type="time"
                aria-label={`Hora de cierre ${DAY_LABELS[d.day]}`}
                value={d.close}
                onChange={(e) => updateDay(index, "close", e.target.value)}
                className="w-32"
              />
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
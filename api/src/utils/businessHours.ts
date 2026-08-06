import { toZonedTime } from "date-fns-tz";

// Helper puro de horario comercial (design business-hours-access). Sin estado,
// sin cache, sin side effects: recibe `now`, la timezone IANA de la org y el
// array de días → devuelve si el instante cae dentro del horario configurado.
// El tiempo local se resuelve con date-fns-tz (toZonedTime + getters UTC), que
// es la forma correcta de obtener la "hora de pared" de una zona IANA sin
// parsear strings de forma manual.

export interface DaySetting {
  day: number; // 0 (domingo) .. 6 (sábado)
  enabled: boolean;
  open: string; // "HH:MM" (zero-padded)
  close: string; // "HH:MM" (zero-padded)
}

/** Resuelve weekday (0..6) y minutesOfDay (0..1439) en la timezone de la org. */
export const resolveLocalTime = (now: Date, timezone: string) => {
  // toZonedTime devuelve un Date "naive" cuyos getters LOCALES representan la
  // hora de pared de `timezone` (contrato documentado de date-fns-tz: funciona
  // "regardless of the current system time zone"). Por eso usamos getHours()/
  // getDay() y NO los getters UTC: los getters UTC solo coinciden si el server
  // corre en UTC, y se rompen si el runtime está en otra zona.
  const zoned = toZonedTime(now, timezone);
  return {
    weekday: zoned.getDay(),
    minutesOfDay: zoned.getHours() * 60 + zoned.getMinutes(),
  };
};

/**
 * Devuelve si `now` está dentro del horario comercial de la org.
 * Inclusive start / exclusive end: `minutesOfDay >= open && minutesOfDay < close`.
 * Día deshabilitado o ausente → bloqueado.
 */
export const isWithinBusinessHours = (
  now: Date,
  timezone: string,
  days: DaySetting[],
): { allowed: boolean } => {
  const { weekday, minutesOfDay } = resolveLocalTime(now, timezone);
  const day = days.find((d) => d.day === weekday);
  if (!day?.enabled) {
    return { allowed: false };
  }

  const [openHour, openMin] = day.open.split(":").map(Number);
  const [closeHour, closeMin] = day.close.split(":").map(Number);
  const open = openHour * 60 + openMin;
  const close = closeHour * 60 + closeMin;

  return { allowed: minutesOfDay >= open && minutesOfDay < close };
};

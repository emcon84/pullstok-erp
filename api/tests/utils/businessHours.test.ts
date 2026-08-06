import {
  isWithinBusinessHours,
  resolveLocalTime,
  DaySetting,
} from "../../src/utils/businessHours";

/**
 * Unit tests del helper puro de horario comercial (design business-hours-access):
 * el "now" se resuelve SIEMPRE en la timezone IANA de la org (date-fns-tz), con
 * getters UTC sobre la instancia ya zoned — Argentina (UTC-3, sin DST) se usa
 * como zona de referencia con instantes fijos. Inclusive start / exclusive end
 * (`>= open && < close`).
 */

const DAYS = (overrides: Partial<Record<number, Partial<DaySetting>>> = {}) => {
  const days: DaySetting[] = Array.from({ length: 7 }, (_, day) => ({
    day,
    enabled: false,
    slots: [{ open: "09:00", close: "19:00" }],
    ...overrides[day],
  }));
  return days;
};

// Jueves 2026-08-06. En America/Argentina/Buenos_Aires (UTC-3):
//   2026-08-06T12:00:00.000Z  -> 09:00 (jueves)
//   2026-08-06T22:00:00.000Z  -> 19:00 (jueves)
const TZ_AR = "America/Argentina/Buenos_Aires";

describe("resolveLocalTime", () => {
  it("resuelve weekday y minutesOfDay en la zona de la org (UTC-3)", () => {
    const now = new Date("2026-08-06T12:00:00.000Z"); // 09:00 en BA
    const local = resolveLocalTime(now, TZ_AR);

    // Jueves = getUTCDay() 4; 09:00 = 9*60 = 540
    expect(local.weekday).toBe(4);
    expect(local.minutesOfDay).toBe(540);
  });

  it("no confunde la hora UTC con la hora local (zonas != UTC)", () => {
    // 15:00 UTC es 12:00 en BA — debe reportar 12:00, no 15:00.
    const now = new Date("2026-08-06T15:00:00.000Z");
    const local = resolveLocalTime(now, TZ_AR);

    expect(local.minutesOfDay).toBe(12 * 60);
  });

  it("cruza el cambio de día correctamente (medianoche local)", () => {
    // 2026-08-07T03:00:00Z = 2026-08-07 00:00 en BA (viernes, day=5).
    const now = new Date("2026-08-07T03:00:00.000Z");
    const local = resolveLocalTime(now, TZ_AR);

    expect(local.weekday).toBe(5);
    expect(local.minutesOfDay).toBe(0);
  });
});

describe("isWithinBusinessHours", () => {
  it("permite a las 09:00 exactas (inclusive start)", () => {
    const now = new Date("2026-08-06T12:00:00.000Z"); // 09:00 jueves
    const days = DAYS({ 4: { enabled: true, slots: [{ open: "09:00", close: "19:00" }] } });

    expect(isWithinBusinessHours(now, TZ_AR, days).allowed).toBe(true);
  });

  it("bloquea a las 19:00 exactas (exclusive end)", () => {
    const now = new Date("2026-08-06T22:00:00.000Z"); // 19:00 jueves
    const days = DAYS({ 4: { enabled: true, slots: [{ open: "09:00", close: "19:00" }] } });

    expect(isWithinBusinessHours(now, TZ_AR, days).allowed).toBe(false);
  });

  it("bloquea antes de la apertura", () => {
    const now = new Date("2026-08-06T11:59:00.000Z"); // 08:59 jueves
    const days = DAYS({ 4: { enabled: true, slots: [{ open: "09:00", close: "19:00" }] } });

    expect(isWithinBusinessHours(now, TZ_AR, days).allowed).toBe(false);
  });

  it("permite dentro del rango (horario del medio)", () => {
    const now = new Date("2026-08-06T18:00:00.000Z"); // 15:00 jueves
    const days = DAYS({ 4: { enabled: true, slots: [{ open: "09:00", close: "19:00" }] } });

    expect(isWithinBusinessHours(now, TZ_AR, days).allowed).toBe(true);
  });

  it("bloquea un día deshabilitado aunque la hora esté en rango", () => {
    const now = new Date("2026-08-06T15:00:00.000Z"); // 12:00 jueves
    const days = DAYS({ 4: { enabled: false } });

    expect(isWithinBusinessHours(now, TZ_AR, days).allowed).toBe(false);
  });

  it("bloquea si el día no tiene entrada en la config", () => {
    const now = new Date("2026-08-06T15:00:00.000Z"); // jueves
    // Config sin entrada para el jueves (día 4).
    const days = DAYS({ 1: { enabled: true } });

    expect(isWithinBusinessHours(now, TZ_AR, days).allowed).toBe(false);
  });

  it("respeta un horario con minutos no redondos", () => {
    // 08:45 jueves (bloqueado), 09:00 jueves (permitido) con open 08:45.
    const days = DAYS({ 4: { enabled: true, slots: [{ open: "08:45", close: "18:30" }] } });

    expect(
      isWithinBusinessHours(new Date("2026-08-06T11:44:00.000Z"), TZ_AR, days)
        .allowed,
    ).toBe(false); // 08:44 local
    expect(
      isWithinBusinessHours(new Date("2026-08-06T11:45:00.000Z"), TZ_AR, days)
        .allowed,
    ).toBe(true); // 08:45 local
    expect(
      isWithinBusinessHours(new Date("2026-08-06T21:29:00.000Z"), TZ_AR, days)
        .allowed,
    ).toBe(true); // 18:29 local
    expect(
      isWithinBusinessHours(new Date("2026-08-06T21:30:00.000Z"), TZ_AR, days)
        .allowed,
    ).toBe(false); // 18:30 local
  });

  it("soporta horario cortado (múltiples turnos por día)", () => {
    // Jueves abierto 08:00-12:00 Y 16:00-20:00 (horario de interior).
    // Referencias UTC-3: 08:00Z=05:00 local? no — 05:00Z=02:00 local? Reviso:
    // BA = UTC-3 → hora local = hora UTC - 3. 11:00Z -> 08:00 local.
    const days = DAYS({
      4: {
        enabled: true,
        slots: [
          { open: "08:00", close: "12:00" },
          { open: "16:00", close: "20:00" },
        ],
      },
    });

    // Dentro del primer turno: 09:00 local (12:00Z).
    expect(
      isWithinBusinessHours(new Date("2026-08-06T12:00:00.000Z"), TZ_AR, days)
        .allowed,
    ).toBe(true);
    // Hueco entre turnos: 13:00 local (16:00Z) → BLOQUEADO.
    expect(
      isWithinBusinessHours(new Date("2026-08-06T16:00:00.000Z"), TZ_AR, days)
        .allowed,
    ).toBe(false);
    // Dentro del segundo turno: 17:30 local (20:30Z).
    expect(
      isWithinBusinessHours(new Date("2026-08-06T20:30:00.000Z"), TZ_AR, days)
        .allowed,
    ).toBe(true);
    // Después del cierre del segundo turno: 20:00 local exacto (23:00Z) → bloqueado (exclusive end).
    expect(
      isWithinBusinessHours(new Date("2026-08-06T23:00:00.000Z"), TZ_AR, days)
        .allowed,
    ).toBe(false);
    // Antes de la apertura: 07:59 local (10:59Z) → bloqueado.
    expect(
      isWithinBusinessHours(new Date("2026-08-06T10:59:00.000Z"), TZ_AR, days)
        .allowed,
    ).toBe(false);
  });
});

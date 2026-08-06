import { Response } from "express";
import { checkBusinessHours } from "../../src/middlewares/checkBusinessHours";
import { basePrisma } from "../../src/config/db";
import { requireOrganizationId } from "../../src/config/tenantContext";
import { AuthedRequest } from "../../src/middlewares/authMiddleware";

// Mocks: config/db (solo basePrisma — BusinessHourSetting NO es tenant-model,
// se accede por organizationId vía basePrisma) y tenantContext (org fija).
jest.mock("../../src/config/db", () => ({
  basePrisma: {
    businessHourSetting: { findUnique: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn(),
}));

// Congelamos el reloj para que el middleware SIEMPRE evalúe el mismo instante:
// 2026-08-06T18:00:00Z = 15:00 (jueves) en America/Argentina/Buenos_Aires.
jest.useFakeTimers();
jest.setSystemTime(new Date("2026-08-06T18:00:00.000Z"));

const mockedBasePrisma = basePrisma as unknown as {
  businessHourSetting: { findUnique: jest.Mock };
};
const mockedRequireOrganizationId = requireOrganizationId as jest.Mock;

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockRequest = (role: string) =>
  ({ user: { role } }) as unknown as AuthedRequest;

// Jueves habilitado 09:00-19:00 en tz AR; ahora local = 15:00 → dentro.
const INSIDE_SETTING = {
  timezone: "America/Argentina/Buenos_Aires",
  days: [
    { day: 4, enabled: true, slots: [{ open: "09:00", close: "19:00" }] },
    { day: 0, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  ],
};

describe("checkBusinessHours", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireOrganizationId.mockReturnValue("org-1");
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("roles operativos fuera de horario → 403 { error: OUTSIDE_BUSINESS_HOURS } sin next()", async () => {
    mockedBasePrisma.businessHourSetting.findUnique.mockResolvedValue({
      timezone: "America/Argentina/Buenos_Aires",
      days: [
        // Jueves habilitado de 09:00 a 12:00 — 15:00 local queda FUERA.
        { day: 4, enabled: true, slots: [{ open: "09:00", close: "12:00" }] },
      ],
    });
    const req = mockRequest("VENDEDOR");
    const res = mockResponse();
    const next = jest.fn();

    await checkBusinessHours(req, res, next);

    expect(mockedBasePrisma.businessHourSetting.findUnique).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "OUTSIDE_BUSINESS_HOURS",
      message: "El acceso al sistema está disponible solo dentro del horario del comercio.",
    });
  });

  it("rol operativo dentro de horario → next()", async () => {
    mockedBasePrisma.businessHourSetting.findUnique.mockResolvedValue(
      INSIDE_SETTING,
    );
    const req = mockRequest("CASHIER");
    const res = mockResponse();
    const next = jest.fn();

    await checkBusinessHours(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rol operativo sin setting configurado → next() sin restricción (backwards compatible)", async () => {
    mockedBasePrisma.businessHourSetting.findUnique.mockResolvedValue(null);
    const req = mockRequest("EMPLOYEE");
    const res = mockResponse();
    const next = jest.fn();

    await checkBusinessHours(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("MANAGEMENT/ADMIN/SUPERADMIN → next() SIN consultar la DB (fast path)", async () => {
    for (const role of ["MANAGEMENT", "ADMIN", "SUPERADMIN"]) {
      const req = mockRequest(role);
      const res = mockResponse();
      const next = jest.fn();

      await checkBusinessHours(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockedBasePrisma.businessHourSetting.findUnique).not.toHaveBeenCalled();
    }
  });

  it("rol operativo en día deshabilitado → 403 OUTSIDE_BUSINESS_HOURS", async () => {
    mockedBasePrisma.businessHourSetting.findUnique.mockResolvedValue({
      timezone: "America/Argentina/Buenos_Aires",
      days: [
        // Jueves (day 4) deshabilitado — aunque sea de 00:00 a 23:59.
        { day: 4, enabled: false, slots: [{ open: "00:00", close: "23:59" }] },
      ],
    });
    const req = mockRequest("VENDEDOR");
    const res = mockResponse();
    const next = jest.fn();

    await checkBusinessHours(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "OUTSIDE_BUSINESS_HOURS" }),
    );
  });

  it("responde 400 si falla la query (ej. sin contexto de org)", async () => {
    mockedRequireOrganizationId.mockImplementation(() => {
      throw new Error("No hay contexto de organización (tenant) en este request");
    });
    const req = mockRequest("VENDEDOR");
    const res = mockResponse();
    const next = jest.fn();

    await checkBusinessHours(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: expect.any(String) });
  });
});

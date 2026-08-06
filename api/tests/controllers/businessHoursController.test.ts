import { Request, Response } from "express";
import { basePrisma } from "../../src/config/db";
import businessHoursController from "../../src/controllers/businessHoursController";

// Mocks: config/db (solo basePrisma — BusinessHourSetting NO es tenant-model,
// se accede por organizationId vía basePrisma, patrón StoreSettings) y
// tenantContext (org fija).
jest.mock("../../src/config/db", () => ({
  basePrisma: {
    businessHourSetting: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedBasePrisma = basePrisma as unknown as {
  businessHourSetting: { findUnique: jest.Mock; upsert: jest.Mock };
};

const mockRequest = (body?: any) => ({ body } as unknown as Request);
const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const DEFAULT_DAYS = [
  { day: 0, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 1, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 2, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 3, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 4, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 5, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
  { day: 6, enabled: false, slots: [{ open: "09:00", close: "19:00" }] },
];

describe("businessHoursController.getBusinessHours", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("devuelve defaults cuando la org nunca configuró horarios (create-on-read, sin persistir)", async () => {
    mockedBasePrisma.businessHourSetting.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await businessHoursController.getBusinessHours(mockRequest(), res);

    expect(mockedBasePrisma.businessHourSetting.findUnique).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.timezone).toBe("America/Argentina/Buenos_Aires");
    expect(payload.days).toHaveLength(7);
    expect(payload.days.every((d: any) => !d.enabled)).toBe(true);
    // create-on-read: no se llama upsert nunca
    expect(mockedBasePrisma.businessHourSetting.upsert).not.toHaveBeenCalled();
  });

  it("devuelve la config guardada cuando existe", async () => {
    mockedBasePrisma.businessHourSetting.findUnique.mockResolvedValue({
      id: "bh-1",
      organizationId: "org-1",
      timezone: "America/New_York",
      days: DEFAULT_DAYS,
      updatedAt: new Date(),
    });

    const res = mockResponse();
    await businessHoursController.getBusinessHours(mockRequest(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.timezone).toBe("America/New_York");
    expect(payload.days).toEqual(DEFAULT_DAYS);
  });
});

describe("businessHoursController.updateBusinessHours", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("hace upsert scoped por organizationId (nunca por body) y devuelve la config guardada", async () => {
    mockedBasePrisma.businessHourSetting.upsert.mockResolvedValue({
      id: "bh-1",
      organizationId: "org-1",
      timezone: "America/Argentina/Buenos_Aires",
      days: DEFAULT_DAYS,
      updatedAt: new Date(),
    });

    const res = mockResponse();
    await businessHoursController.updateBusinessHours(
      mockRequest({ timezone: "America/Argentina/Buenos_Aires", days: DEFAULT_DAYS }),
      res,
    );

    expect(mockedBasePrisma.businessHourSetting.upsert).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      update: { timezone: "America/Argentina/Buenos_Aires", days: DEFAULT_DAYS },
      create: {
        organizationId: "org-1",
        timezone: "America/Argentina/Buenos_Aires",
        days: DEFAULT_DAYS,
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].days).toEqual(DEFAULT_DAYS);
  });

  it("propaga error de DB como 400", async () => {
    mockedBasePrisma.businessHourSetting.upsert.mockRejectedValue(
      new Error("boom"),
    );

    const res = mockResponse();
    await businessHoursController.updateBusinessHours(
      mockRequest({ timezone: "America/Argentina/Buenos_Aires", days: DEFAULT_DAYS }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "boom" });
  });
});
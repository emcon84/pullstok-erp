import { Request, Response } from "express";
import { basePrisma } from "../../src/config/db";
import arcaSettingsController from "../../src/controllers/arcaSettingsController";

// ArcaSetting es 1:1 con Organization y NO está en TENANT_MODELS: se accede
// por organizationId vía basePrisma (patrón storeSettingsController).
jest.mock("../../src/config/db", () => ({
  basePrisma: {
    arcaSetting: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedBase = basePrisma as unknown as {
  arcaSetting: { findUnique: jest.Mock; upsert: jest.Mock };
};

const mockRequest = (body?: any) => ({ body } as unknown as Request);
const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const FULL_SETTING = {
  id: "s1",
  organizationId: "org-1",
  cuitEmisor: "30709706701",
  puntoVenta: 2,
  environment: "HOMOLOGACION",
  certPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.crt",
  keyPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.key",
  enabled: false,
};

describe("arcaSettingsController.getArcaSettings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("create-on-read: sin fila devuelve defaults con enabled=false (gate off)", async () => {
    mockedBase.arcaSetting.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await arcaSettingsController.getArcaSettings(mockRequest(), res);

    expect(mockedBase.arcaSetting.findUnique).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.enabled).toBe(false);
    expect(payload.environment).toBe("HOMOLOGACION");
    expect(payload.cuitEmisor).toBe("");
    expect(payload.puntoVenta).toBeNull();
  });

  it("devuelve la configuración guardada cuando existe", async () => {
    mockedBase.arcaSetting.findUnique.mockResolvedValue(FULL_SETTING);

    const res = mockResponse();
    await arcaSettingsController.getArcaSettings(mockRequest(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.cuitEmisor).toBe("30709706701");
    expect(payload.puntoVenta).toBe(2);
    expect(payload.enabled).toBe(false);
  });
});

describe("arcaSettingsController.updateArcaSettings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("upsert por organizationId (nunca por body) y devuelve la fila", async () => {
    mockedBase.arcaSetting.upsert.mockResolvedValue({
      ...FULL_SETTING,
      puntoVenta: 4,
      enabled: true,
    });

    const res = mockResponse();
    await arcaSettingsController.updateArcaSettings(
      mockRequest({
        cuitEmisor: "30709706701",
        puntoVenta: 4,
        environment: "HOMOLOGACION",
        certPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.crt",
        keyPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.key",
        enabled: true,
      }),
      res,
    );

    expect(mockedBase.arcaSetting.upsert).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      update: expect.objectContaining({ puntoVenta: 4, enabled: true }),
      create: expect.objectContaining({
        organizationId: "org-1",
        puntoVenta: 4,
        enabled: true,
      }),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.puntoVenta).toBe(4);
    expect(payload.enabled).toBe(true);
  });
});

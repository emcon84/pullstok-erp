import { Request, Response } from "express";
import { basePrisma } from "../../src/config/db";
import arcaSettingsController from "../../src/controllers/arcaSettingsController";

// ArcaSetting es 1:1 con Organization y NO está en TENANT_MODELS: se accede
// por organizationId vía basePrisma (patrón storeSettingsController).
jest.mock("../../src/config/db", () => ({
  basePrisma: {
    arcaSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    arcaCertificate: { findUnique: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedBase = basePrisma as unknown as {
  arcaSetting: { findUnique: jest.Mock; upsert: jest.Mock };
  arcaCertificate: { findUnique: jest.Mock };
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
    mockedBase.arcaCertificate.findUnique.mockResolvedValue({ id: "cert-1" });
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

  it("enabled=true sin ArcaCertificate para ese ambiente → 400, NO hace upsert (sdd/arca-certificados-self-service)", async () => {
    mockedBase.arcaCertificate.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await arcaSettingsController.updateArcaSettings(
      mockRequest({
        cuitEmisor: "30709706701",
        puntoVenta: 4,
        environment: "PRODUCCION",
        certPath: "/var/www/pullstok/certs/org-1/wswfev1-PRODUCCION.crt",
        keyPath: "/var/www/pullstok/certs/org-1/wswfev1-PRODUCCION.key",
        enabled: true,
      }),
      res,
    );

    expect(mockedBase.arcaCertificate.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_environment: {
          organizationId: "org-1",
          environment: "PRODUCCION",
        },
      },
    });
    expect(mockedBase.arcaSetting.upsert).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Falta cargar el certificado de PRODUCCION antes de habilitar este ambiente.",
    });
  });

  it("enabled=false no exige ArcaCertificate (apagar el gate siempre debe poder guardarse)", async () => {
    mockedBase.arcaSetting.upsert.mockResolvedValue({ ...FULL_SETTING, enabled: false });

    const res = mockResponse();
    await arcaSettingsController.updateArcaSettings(
      mockRequest({
        cuitEmisor: "30709706701",
        puntoVenta: 4,
        environment: "HOMOLOGACION",
        certPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.crt",
        keyPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.key",
        enabled: false,
      }),
      res,
    );

    expect(mockedBase.arcaCertificate.findUnique).not.toHaveBeenCalled();
    expect(mockedBase.arcaSetting.upsert).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

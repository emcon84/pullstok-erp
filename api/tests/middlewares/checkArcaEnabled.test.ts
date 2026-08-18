import { Request, Response, NextFunction } from "express";
import { basePrisma } from "../../src/config/db";
import { checkArcaEnabled } from "../../src/middlewares/checkArcaEnabled";

jest.mock("../../src/config/db", () => ({
  basePrisma: {
    arcaSetting: { findUnique: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedBase = basePrisma as unknown as {
  arcaSetting: { findUnique: jest.Mock };
};

const mockRequest = () => ({} as unknown as Request);
const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = jest.fn() as unknown as NextFunction;

const COMPLETE_SETTING = {
  id: "s1",
  organizationId: "org-1",
  cuitEmisor: "30709706701",
  puntoVenta: 2,
  environment: "HOMOLOGACION",
  certPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.crt",
  keyPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.key",
  enabled: true,
};

describe("checkArcaEnabled", () => {
  beforeEach(() => jest.clearAllMocks());

  it("gate off sin fila → 403 ARCA_NOT_AVAILABLE (spec 3.3)", async () => {
    mockedBase.arcaSetting.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await checkArcaEnabled(mockRequest(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "ARCA_NOT_AVAILABLE" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("fila con enabled=false → 403 ARCA_NOT_AVAILABLE (gate off)", async () => {
    mockedBase.arcaSetting.findUnique.mockResolvedValue({
      ...COMPLETE_SETTING,
      enabled: false,
    });

    const res = mockResponse();
    await checkArcaEnabled(mockRequest(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("fila incompleta (sin rutas de cert) → 403 ARCA_NOT_AVAILABLE", async () => {
    mockedBase.arcaSetting.findUnique.mockResolvedValue({
      ...COMPLETE_SETTING,
      certPath: "",
      keyPath: "",
    });

    const res = mockResponse();
    await checkArcaEnabled(mockRequest(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("fila completa + enabled → next() y adjunta el contexto ARCA al request", async () => {
    mockedBase.arcaSetting.findUnique.mockResolvedValue(COMPLETE_SETTING);

    const req = mockRequest() as Request & { arcaContext?: any };
    const res = mockResponse();
    await checkArcaEnabled(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(req.arcaContext).toEqual({
      organizationId: "org-1",
      cuitEmisor: "30709706701",
      puntoVenta: 2,
      environment: "HOMOLOGACION",
      certPath: COMPLETE_SETTING.certPath,
      keyPath: COMPLETE_SETTING.keyPath,
    });
  });
});

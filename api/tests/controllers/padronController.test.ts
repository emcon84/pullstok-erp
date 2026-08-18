import { Request, Response } from "express";
import { basePrisma } from "../../src/config/db";
import padronController from "../../src/controllers/padronController";
import { getPersona } from "../../src/integrations/arca/padronClient";
import { ArcaError, ARCA_ERROR_CODES } from "../../src/integrations/arca/types";
import type { PadronPersona } from "../../src/integrations/arca/types";

// Consulta al padrón A4: valida CUIT, lee la ArcaSetting de la org y delega en
// el cliente padron. El front NO bloquea la carga manual si falla: los errores
// llegan con código/mensaje claros (404 CUIT inexistente incluido).

jest.mock("../../src/config/db", () => ({
  basePrisma: {
    arcaSetting: { findUnique: jest.fn() },
  },
}));
jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));
jest.mock("../../src/integrations/arca/padronClient", () => ({
  getPersona: jest.fn(),
}));

const mockedBase = basePrisma as unknown as {
  arcaSetting: { findUnique: jest.Mock };
};
const getPersonaMock = getPersona as jest.Mock;

const SETTING = {
  id: "s1",
  organizationId: "org-1",
  cuitEmisor: "30709706701",
  puntoVenta: 2,
  environment: "HOMOLOGACION",
  certPath: "/var/www/pullstok/certs/org-1/padron-homo.crt",
  keyPath: "/var/www/pullstok/certs/org-1/padron-homo.key",
  enabled: true,
};

const PERSONA: PadronPersona = {
  cuit: "20000000001",
  razonSocial: "GOMEZ JUAN CARLOS",
  estado: "ACTIVO",
  impuestos: [{ id: 30, descripcion: "IVA", estado: "" }],
  domicilio: {
    direccion: "AV CORRIENTES 1234",
    localidad: "CIUDAD AUTONOMA BUENOS AIRES",
    codPostal: "1043",
    provincia: "CIUDAD AUTONOMA BUENOS AIRES",
  },
  constanciaUrl: null,
};

const mockRequest = (params: any = {}) =>
  ({ params } as unknown as Request);
const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("padronController.getPadronByCuit", () => {
  beforeEach(() => jest.clearAllMocks());

  it("CUIT inválido → 400 CUIT_INVALIDO (sin tocar DB ni cliente)", async () => {
    const res = mockResponse();
    await padronController.getPadronByCuit(
      mockRequest({ cuit: "12345" }) as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe("CUIT_INVALIDO");
    expect(mockedBase.arcaSetting.findUnique).not.toHaveBeenCalled();
    expect(getPersonaMock).not.toHaveBeenCalled();
  });

  it("sin ArcaSetting habilitada → 403 ARCA_NOT_CONFIGURED", async () => {
    mockedBase.arcaSetting.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await padronController.getPadronByCuit(
      mockRequest({ cuit: "20-00000000-1" }) as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error).toBe("ARCA_NOT_CONFIGURED");
    expect(getPersonaMock).not.toHaveBeenCalled();
  });

  it("CUIT inexistente en el padrón → 404 ARCA_PADRON_NOT_FOUND", async () => {
    mockedBase.arcaSetting.findUnique.mockResolvedValue(SETTING);
    getPersonaMock.mockRejectedValue(
      new ArcaError(
        ARCA_ERROR_CODES.ARCA_PADRON_NOT_FOUND,
        "El CUIT no existe en el padrón de ARCA",
        404,
      ),
    );

    const res = mockResponse();
    await padronController.getPadronByCuit(
      mockRequest({ cuit: "20123456786" }) as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error).toBe("ARCA_PADRON_NOT_FOUND");
  });

  it("feliz → 200 con la persona (CUIT normalizado)", async () => {
    mockedBase.arcaSetting.findUnique.mockResolvedValue(SETTING);
    getPersonaMock.mockResolvedValue(PERSONA);

    const res = mockResponse();
    await padronController.getPadronByCuit(
      mockRequest({ cuit: "20-00000000-1" }) as any,
      res,
    );

    expect(mockedBase.arcaSetting.findUnique).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
    });
    expect(getPersonaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        cuitEmisor: "30709706701",
        environment: "HOMOLOGACION",
      }),
      "20000000001",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toEqual(PERSONA);
  });
});

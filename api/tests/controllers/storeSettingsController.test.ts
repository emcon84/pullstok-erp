import { Request, Response } from "express";
import { basePrisma } from "../../src/config/db";
import storeSettingsController from "../../src/controllers/storeSettingsController";

// Mocks: config/db (solo basePrisma — StoreSettings NO es tenant-model, se
// accede por organizationId vía basePrisma) y tenantContext (org fija).
jest.mock("../../src/config/db", () => ({
  basePrisma: {
    storeSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    branch: { findFirst: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedBasePrisma = basePrisma as unknown as {
  storeSettings: { findUnique: jest.Mock; upsert: jest.Mock };
  branch: { findFirst: jest.Mock };
};

const mockRequest = (body?: any) => ({ body } as unknown as Request);
const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("storeSettingsController.getStoreSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("incluye storeBranchId en la respuesta (null si la org nunca configuró nada)", async () => {
    mockedBasePrisma.storeSettings.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await storeSettingsController.getStoreSettings(mockRequest(), res);

    expect(mockedBasePrisma.storeSettings.findUnique).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.storeBranchId).toBeNull();
    expect(payload.isPublished).toBe(false);
  });

  it("devuelve el storeBranchId guardado cuando está configurado", async () => {
    mockedBasePrisma.storeSettings.findUnique.mockResolvedValue({
      storeBranchId: "b-2",
      isPublished: true,
    });

    const res = mockResponse();
    await storeSettingsController.getStoreSettings(mockRequest(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.storeBranchId).toBe("b-2");
    expect(payload.isPublished).toBe(true);
  });
});

describe("storeSettingsController.updateStoreSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("valida que la sucursal exista, sea de la org y esté ACTIVA → 400 si no", async () => {
    mockedBasePrisma.branch.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await storeSettingsController.updateStoreSettings(
      mockRequest({ storeBranchId: "b-ajena" }),
      res,
    );

    expect(mockedBasePrisma.branch.findFirst).toHaveBeenCalledWith({
      where: { id: "b-ajena", organizationId: "org-1", isActive: true },
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "La sucursal configurada no existe o no está activa",
    });
    expect(mockedBasePrisma.storeSettings.upsert).not.toHaveBeenCalled();
  });

  it("guarda un storeBranchId válido y lo devuelve en la respuesta", async () => {
    mockedBasePrisma.branch.findFirst.mockResolvedValue({
      id: "b-2",
      isActive: true,
    });
    mockedBasePrisma.storeSettings.upsert.mockResolvedValue({
      storeBranchId: "b-2",
    });

    const res = mockResponse();
    await storeSettingsController.updateStoreSettings(
      mockRequest({ storeBranchId: "b-2" }),
      res,
    );

    expect(mockedBasePrisma.storeSettings.upsert).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      update: { storeBranchId: "b-2" },
      create: { organizationId: "org-1", storeBranchId: "b-2" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.storeBranchId).toBe("b-2");
  });

  it("storeBranchId null limpia la configuración SIN validar sucursal (fallback HQ)", async () => {
    mockedBasePrisma.storeSettings.upsert.mockResolvedValue({
      storeBranchId: null,
    });

    const res = mockResponse();
    await storeSettingsController.updateStoreSettings(
      mockRequest({ storeBranchId: null }),
      res,
    );

    expect(mockedBasePrisma.branch.findFirst).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.storeBranchId).toBeNull();
  });
});

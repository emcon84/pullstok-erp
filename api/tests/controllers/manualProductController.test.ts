import { Request, Response } from "express";
import manualProductController from "../../src/controllers/manualProductController";
import {
  ManualProductError,
  createManualProduct,
  listManualProducts,
  promoteManualProduct,
  deleteManualProduct,
} from "../../src/services/manualProductService";
import { emitProductChanged } from "../../src/realtime/socket";

jest.mock("../../src/services/manualProductService", () => {
  const actual = jest.requireActual("../../src/services/manualProductService");
  return {
    ...actual,
    createManualProduct: jest.fn(),
    listManualProducts: jest.fn(),
    promoteManualProduct: jest.fn(),
    deleteManualProduct: jest.fn(),
  };
});

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("../../src/realtime/socket", () => ({
  emitProductChanged: jest.fn(),
}));

const mockedCreate = createManualProduct as jest.Mock;
const mockedList = listManualProducts as jest.Mock;
const mockedPromote = promoteManualProduct as jest.Mock;
const mockedDelete = deleteManualProduct as jest.Mock;
const mockedEmit = emitProductChanged as jest.Mock;

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe("manualProductController.createManualProduct", () => {
  beforeEach(() => jest.clearAllMocks());

  it("201 con el producto creado y emite product:changed 'created'", async () => {
    const product = { id: "p1", name: "CORREA", price: 10, quantity: 0 };
    mockedCreate.mockResolvedValue(product);
    const res = mockResponse();

    await manualProductController.createManualProduct(
      { body: { name: "correa", price: 10 } } as Request,
      res,
    );

    expect(mockedCreate).toHaveBeenCalledWith({ name: "correa", price: 10 });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(product);
    expect(mockedEmit).toHaveBeenCalledWith("org-1", "p1", "created");
  });

  it("un fallo del socket no rompe la respuesta", async () => {
    mockedCreate.mockResolvedValue({ id: "p1" });
    mockedEmit.mockImplementationOnce(() => {
      throw new Error("socket caído");
    });
    const res = mockResponse();
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await manualProductController.createManualProduct(
      { body: { name: "x", price: 1 } } as Request,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("500 ante un error inesperado del servicio", async () => {
    mockedCreate.mockRejectedValue(new Error("boom"));
    const res = mockResponse();
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await manualProductController.createManualProduct(
      { body: { name: "x", price: 1 } } as Request,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockedEmit).not.toHaveBeenCalled();
  });
});

describe("manualProductController.listManualProducts", () => {
  beforeEach(() => jest.clearAllMocks());

  it("200 con la lista", async () => {
    mockedList.mockResolvedValue([{ id: "p1" }]);
    const res = mockResponse();

    await manualProductController.listManualProducts({} as Request, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ id: "p1" }]);
  });
});

describe("manualProductController.promoteManualProduct", () => {
  beforeEach(() => jest.clearAllMocks());

  const req = { params: { id: "p1" }, body: { categoryId: "cat-real" } } as unknown as Request;

  it("200 con el producto promovido y emite 'updated'", async () => {
    mockedPromote.mockResolvedValue({ id: "p1", isManual: false });
    const res = mockResponse();

    await manualProductController.promoteManualProduct(req, res);

    expect(mockedPromote).toHaveBeenCalledWith("p1", "cat-real");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: "p1", isManual: false });
    expect(mockedEmit).toHaveBeenCalledWith("org-1", "p1", "updated");
  });

  it("propaga el status y mensaje de ManualProductError (404) sin emitir", async () => {
    mockedPromote.mockRejectedValue(
      new ManualProductError(404, "Producto manual no encontrado"),
    );
    const res = mockResponse();

    await manualProductController.promoteManualProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Producto manual no encontrado" });
    expect(mockedEmit).not.toHaveBeenCalled();
  });

  it("propaga ManualProductError 400 (categoría inválida)", async () => {
    mockedPromote.mockRejectedValue(new ManualProductError(400, "categoría inválida"));
    const res = mockResponse();

    await manualProductController.promoteManualProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("manualProductController.deleteManualProduct", () => {
  beforeEach(() => jest.clearAllMocks());

  const req = { params: { id: "p1" } } as unknown as Request;

  it("200 con mensaje y emite product:changed 'deleted'", async () => {
    mockedDelete.mockResolvedValue(undefined);
    const res = mockResponse();

    await manualProductController.deleteManualProduct(req, res);

    expect(mockedDelete).toHaveBeenCalledWith("p1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "Producto eliminado" });
    expect(mockedEmit).toHaveBeenCalledWith("org-1", "p1", "deleted");
  });

  it("un fallo del socket no rompe la respuesta", async () => {
    mockedDelete.mockResolvedValue(undefined);
    mockedEmit.mockImplementationOnce(() => {
      throw new Error("socket caído");
    });
    const res = mockResponse();
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await manualProductController.deleteManualProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("404 con { message } si no existe / no es manual, sin emitir", async () => {
    mockedDelete.mockRejectedValue(
      new ManualProductError(404, "Producto manual no encontrado"),
    );
    const res = mockResponse();

    await manualProductController.deleteManualProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Producto manual no encontrado" });
    expect(mockedEmit).not.toHaveBeenCalled();
  });

  it("409 con { message } si está en un pedido/presupuesto, sin emitir", async () => {
    mockedDelete.mockRejectedValue(
      new ManualProductError(
        409,
        "No se puede eliminar: el producto está en un pedido o presupuesto",
      ),
    );
    const res = mockResponse();

    await manualProductController.deleteManualProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: "No se puede eliminar: el producto está en un pedido o presupuesto",
    });
    expect(mockedEmit).not.toHaveBeenCalled();
  });

  it("500 ante un error inesperado, sin emitir", async () => {
    mockedDelete.mockRejectedValue(new Error("boom"));
    const res = mockResponse();
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await manualProductController.deleteManualProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockedEmit).not.toHaveBeenCalled();
  });
});

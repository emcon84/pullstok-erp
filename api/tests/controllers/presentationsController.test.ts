import { Request, Response } from "express";
import presentationsController from "../../src/controllers/presentationsController";
import { PresentationError } from "../../src/utils/presentations";
import * as service from "../../src/services/presentationsService";
import { emitProductChanged } from "../../src/realtime/socket";

jest.mock("../../src/services/presentationsService");
jest.mock("../../src/realtime/socket", () => ({ emitProductChanged: jest.fn() }));
jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mocked = service as jest.Mocked<typeof service>;

const run = async (handler: any, body: any = {}) => {
  const req = { params: { id: "p-1" }, body } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  await handler(req, res);
  return res as unknown as { status: jest.Mock; json: jest.Mock };
};

beforeEach(() => jest.clearAllMocks());

describe.each([
  ["replace", "replacePresentations", presentationsController.replace, 200],
  ["enable", "enablePresentations", presentationsController.enable, 200],
  ["disable", "disablePresentations", presentationsController.disable, 200],
] as const)("%s", (_n, fn, handler, okStatus) => {
  it("happy path returns the presentation list and notifies the catalog", async () => {
    (mocked[fn] as jest.Mock).mockResolvedValue([{ id: "pr-1" }]);
    const res = await run(handler, { presentations: [] });
    expect(res.status).toHaveBeenCalledWith(okStatus);
    expect(res.json).toHaveBeenCalledWith([{ id: "pr-1" }]);
    expect(emitProductChanged).toHaveBeenCalledWith("org-1", "p-1", "updated");
  });

  it("maps PresentationError to its status and code (cross-org product -> 404)", async () => {
    (mocked[fn] as jest.Mock).mockRejectedValue(
      new PresentationError("PRODUCT_NOT_FOUND", "Producto no encontrado", 404),
    );
    const res = await run(handler, { presentations: [] });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Producto no encontrado", code: "PRODUCT_NOT_FOUND" });
    expect(emitProductChanged).not.toHaveBeenCalled();
  });

  it("unexpected errors -> 500", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    (mocked[fn] as jest.Mock).mockRejectedValue(new Error("boom"));
    const res = await run(handler, { presentations: [] });
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

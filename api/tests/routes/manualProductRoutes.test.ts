import productRoutes from "../../src/routes/productRoutes";

jest.mock("../../src/config/db", () => ({ prisma: {}, basePrisma: {} }));
jest.mock("../../src/realtime/socket", () => ({ emitProductChanged: jest.fn() }));

type Layer = { route?: { path: string; methods: Record<string, boolean> } };
const stack = (productRoutes as unknown as { stack: Layer[] }).stack;

const indexOf = (method: string, path: string) =>
  stack.findIndex((l) => l.route?.path === path && l.route.methods[method]);

// "manual" es un literal: si "/:id" se registrara antes lo capturaría como id.
describe("productRoutes — endpoints de producto manual", () => {
  it("registra GET /manual, POST /manual y POST /:id/promote", () => {
    expect(indexOf("get", "/manual")).toBeGreaterThanOrEqual(0);
    expect(indexOf("post", "/manual")).toBeGreaterThanOrEqual(0);
    expect(indexOf("post", "/:id/promote")).toBeGreaterThanOrEqual(0);
  });

  it("GET /manual va antes de GET /:id", () => {
    expect(indexOf("get", "/manual")).toBeLessThan(indexOf("get", "/:id"));
  });

  it("registra DELETE /manual/:id antes de DELETE /:id", () => {
    const manual = indexOf("delete", "/manual/:id");
    expect(manual).toBeGreaterThanOrEqual(0);
    expect(manual).toBeLessThan(indexOf("delete", "/:id"));
  });

  it("DELETE /manual/:id exige autenticación y rol ADMIN/MANAGEMENT (mismo guard que GET /manual)", () => {
    type RouteLayer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } };
    const layers = (productRoutes as unknown as { stack: RouteLayer[] }).stack;
    const handlers = (method: string, path: string) =>
      layers
        .find((l) => l.route?.path === path && l.route.methods[method])!
        .route!.stack.map((s) => s.handle);

    const del = handlers("delete", "/manual/:id");
    const list = handlers("get", "/manual");
    // authenticateJWT + requireRole(...) + controller: mismos middlewares que el listado admin.
    expect(del).toHaveLength(list.length);
    expect(del[0]).toBe(list[0]);

    // El 2º handler es requireRole("ADMIN","MANAGEMENT"): se ejercita su comportamiento.
    const roleGuard = del[1] as (req: any, res: any, next: () => void) => unknown;
    const run = (role: string) => {
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      roleGuard({ user: { role } }, res, next);
      return { res, next };
    };
    expect(run("ADMIN").next).toHaveBeenCalled();
    expect(run("MANAGEMENT").next).toHaveBeenCalled();
    for (const role of ["VENDEDOR", "CASHIER"]) {
      const { res, next } = run(role);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });
});

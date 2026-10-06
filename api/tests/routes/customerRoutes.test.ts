import customerRoutes from "../../src/routes/customerRoutes";

jest.mock("../../src/config/db", () => ({ prisma: {}, basePrisma: {} }));

type Layer = { route?: { path: string; methods: Record<string, boolean> } };
const stack = (customerRoutes as unknown as { stack: Layer[] }).stack;

const indexOf = (method: string, path: string) =>
  stack.findIndex((l) => l.route?.path === path && l.route.methods[method]);

// "balances" es un literal: si "/:id" se registrara antes lo capturaría como id.
describe("customerRoutes — cuenta corriente", () => {
  it("registers the five account endpoints", () => {
    expect(indexOf("get", "/balances")).toBeGreaterThanOrEqual(0);
    expect(indexOf("get", "/:id/account")).toBeGreaterThanOrEqual(0);
    expect(indexOf("post", "/:id/account/payments")).toBeGreaterThanOrEqual(0);
    expect(indexOf("post", "/:id/account/statement/whatsapp")).toBeGreaterThanOrEqual(0);
    expect(indexOf("post", "/:id/account/statement-link")).toBeGreaterThanOrEqual(0);
  });

  it("GET /balances goes before GET /:id", () => {
    expect(indexOf("get", "/balances")).toBeLessThan(indexOf("get", "/:id"));
  });

  it("GET /account-collections goes before GET /:id and is gated + query-validated", () => {
    expect(indexOf("get", "/account-collections")).toBeGreaterThanOrEqual(0);
    expect(indexOf("get", "/account-collections")).toBeLessThan(indexOf("get", "/:id"));
    const route = (stack.find(
      (l) => l.route?.path === "/account-collections" && l.route.methods["get"],
    ) as any).route.stack;
    // authenticateJWT + checkBusinessHours + requireRole + validateQuery + handler
    expect(route.length).toBe(5);
  });

  it("POST /:id/account/statement/whatsapp goes before GET /:id", () => {
    expect(indexOf("post", "/:id/account/statement/whatsapp")).toBeLessThan(
      indexOf("get", "/:id"),
    );
  });

  // wa.me fallback (T4): literal segment under "/:id/account" — before "/:id".
  it("POST /:id/account/statement-link goes before GET /:id", () => {
    expect(indexOf("post", "/:id/account/statement-link")).toBeLessThan(
      indexOf("get", "/:id"),
    );
  });

  // Balances lock: literals BEFORE "/:id", role-gated, summary behind the token.
  it("registers the balances lock endpoints before GET /:id", () => {
    expect(indexOf("post", "/balances/unlock")).toBeGreaterThanOrEqual(0);
    expect(indexOf("get", "/balances/summary")).toBeGreaterThanOrEqual(0);
    expect(indexOf("get", "/balances/summary")).toBeLessThan(indexOf("get", "/:id"));
  });

  it("restricts unlock and summary to ADMIN/MANAGEMENT (VENDEDOR gets 403)", () => {
    const { requireRole } = jest.requireActual("../../src/middlewares/authMiddleware");
    const gate = requireRole("ADMIN", "MANAGEMENT");
    const run = (role: string) => {
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      gate({ user: { role } }, res, next);
      return { res, next };
    };
    expect(run("VENDEDOR").res.status).toHaveBeenCalledWith(403);
    expect(run("ADMIN").next).toHaveBeenCalled();
    // The route stacks must actually include a handler chain longer than auth+hours+handler.
    const layer = (m: string, path: string) =>
      (stack.find((l) => l.route?.path === path && l.route.methods[m]) as any).route.stack;
    expect(layer("post", "/balances/unlock").length).toBeGreaterThanOrEqual(5);
    expect(layer("get", "/balances/summary").length).toBeGreaterThanOrEqual(5);
  });
});

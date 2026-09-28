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
});

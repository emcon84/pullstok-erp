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
});

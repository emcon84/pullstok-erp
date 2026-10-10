import productRoutes from "../../src/routes/productRoutes";
import salesRoutes from "../../src/routes/salesRoutes";
import looseStockRoutes from "../../src/routes/looseStockRoutes";

jest.mock("../../src/config/db", () => ({ prisma: {}, basePrisma: {} }));
jest.mock("../../src/realtime/socket", () => ({ emitProductChanged: jest.fn() }));

type RouteLayer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] };
};
const handlersOf = (router: unknown, method: string, path: string) =>
  (router as { stack: RouteLayer[] }).stack
    .find((l) => l.route?.path === path && l.route.methods[method])
    ?.route?.stack.map((s) => s.handle);

// Ejecuta el handler requireRole (indice dado) con un rol y devuelve si dejó pasar.
const allows = (guard: Function, role: string) => {
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  guard({ user: { role } }, res, next);
  return { passed: next.mock.calls.length > 0, status: res.status.mock.calls[0]?.[0] };
};

// [router, method, path, índice del requireRole]
const OPEN_TO_VENDEDOR: [string, unknown, string, string, number][] = [
  ["DELETE /sales/:id", salesRoutes, "delete", "/:id", 2],
  ["PUT /loose-stock/:lineId", looseStockRoutes, "put", "/:lineId", 2],
  ["DELETE /products/:id", productRoutes, "delete", "/:id", 2],
  ["PUT /products/:id/presentations", productRoutes, "put", "/:id/presentations", 2],
  ["POST /products/:id/presentations/enable", productRoutes, "post", "/:id/presentations/enable", 2],
  ["POST /products/:id/presentations/disable", productRoutes, "post", "/:id/presentations/disable", 2],
  ["POST /products/bulk-publish", productRoutes, "post", "/bulk-publish", 2],
  ["GET /products/manual", productRoutes, "get", "/manual", 1],
  ["DELETE /products/manual/:id", productRoutes, "delete", "/manual/:id", 1],
  ["POST /products/:id/promote", productRoutes, "post", "/:id/promote", 2],
];

describe("VENDEDOR habilitado (ADMIN/MANAGEMENT/VENDEDOR; CASHIER/EMPLOYEE -> 403)", () => {
  it.each(OPEN_TO_VENDEDOR)("%s", (_n, router, method, path, idx) => {
    const hs = handlersOf(router, method, path);
    expect(hs).toBeDefined();
    const guard = hs![idx];
    for (const role of ["ADMIN", "MANAGEMENT", "VENDEDOR"]) {
      expect(allows(guard, role).passed).toBe(true);
    }
    for (const role of ["CASHIER", "EMPLOYEE"]) {
      const r = allows(guard, role);
      expect(r.passed).toBe(false);
      expect(r.status).toBe(403);
    }
  });
});

const ADMIN_ONLY: [string, string, string, number][] = [
  ["POST /products/bulk-price-update", "post", "/bulk-price-update", 2],
  ["POST /products/bulk-carried", "post", "/bulk-carried", 2],
  ["POST /products/import-price-list", "post", "/import-price-list", 2],
  ["POST /products/import-price-list/apply", "post", "/import-price-list/apply", 2],
];

describe("Sigue solo ADMIN", () => {
  it.each(ADMIN_ONLY)("%s", (_n, method, path, idx) => {
    const guard = handlersOf(productRoutes, method, path)![idx];
    expect(allows(guard, "ADMIN").passed).toBe(true);
    for (const role of ["MANAGEMENT", "VENDEDOR", "CASHIER"]) {
      expect(allows(guard, role).status).toBe(403);
    }
  });
});

import providerRoutes from "../../src/routes/providerRoutes";

jest.mock("../../src/config/db", () => ({ prisma: {}, basePrisma: {} }));

type Handle = (req: unknown, res: unknown, next: () => void) => unknown;
type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: Handle }[] };
};
const stack = (providerRoutes as unknown as { stack: Layer[] }).stack;

const routeOf = (method: string, path: string) =>
  stack.find((l) => l.route?.path === path && l.route.methods[method])!.route!;

// Corre los middlewares de la ruta (sin el controller final) con un usuario ya
// autenticado y devuelve el primer status que alguno haya respondido.
const statusFor = (method: string, path: string, role: string) => {
  const handles = routeOf(method, path).stack.map((s) => s.handle);
  let status: number | undefined;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  for (const handle of handles.slice(0, -1)) {
    const req = {
      headers: {},
      body: { name: "Proveedor" },
      params: { id: "p1" },
      user: { id: "u1", role, organizationId: "org1" },
    };
    // authenticate/checkBusinessHours requieren token/DB: el guard de rol es el
    // único que decide con req.user, así que solo nos importa si devuelve 403.
    try {
      handle(req, res, () => undefined);
    } catch {
      // middlewares que necesitan infraestructura real: se ignoran
    }
    if (status === 403) return status;
    status = undefined;
  }
  return status;
};

describe("providerRoutes — permisos", () => {
  it.each([
    ["post", "/"],
    ["put", "/:id"],
    ["delete", "/:id"],
  ])("%s %s rechaza VENDEDOR con 403", (method, path) => {
    expect(statusFor(method, path, "VENDEDOR")).toBe(403);
  });

  it.each([
    ["post", "/"],
    ["put", "/:id"],
    ["delete", "/:id"],
  ])("%s %s no rechaza a ADMIN ni MANAGEMENT por rol", (method, path) => {
    expect(statusFor(method, path, "ADMIN")).not.toBe(403);
    expect(statusFor(method, path, "MANAGEMENT")).not.toBe(403);
  });

  it("GET / sigue abierto a cualquier rol (selectores de planilla)", () => {
    expect(statusFor("get", "/", "EMPLOYEE")).not.toBe(403);
  });
});

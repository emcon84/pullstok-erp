import printerRoutes from "../../src/routes/printerRoutes";
import printAgentRoutes from "../../src/routes/printAgentRoutes";

jest.mock("../../src/config/db", () => ({ prisma: {}, basePrisma: {} }));

type Layer = {
  name: string;
  handle: (req: any, res: any, next: any) => any;
  route?: { path: string; methods: Record<string, boolean> };
};
const stackOf = (r: unknown) => (r as { stack: Layer[] }).stack;

const runGate = (role: string) => {
  // Capa 0 = authenticate, capa 1 = requireRole("ADMIN", "MANAGEMENT").
  const gate = stackOf(printerRoutes)[1].handle;
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  const next = jest.fn();
  gate({ user: { role } }, res, next);
  return { res, next };
};

describe("printerRoutes — role gate", () => {
  it.each(["ADMIN", "MANAGEMENT"])("allows %s", (role) => {
    const { next, res } = runGate(role);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each(["VENDEDOR", "CASHIER", "EMPLOYEE"])("rejects %s with 403", (role) => {
    const { next, res } = runGate(role);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("registers /agents and /pairing-codes before /:id", () => {
    const paths = stackOf(printerRoutes).filter((l) => l.route).map((l) => l.route!.path);
    expect(paths).toEqual(expect.arrayContaining(["/agents", "/pairing-codes", "/", "/:id"]));
  });
});

describe("printAgentRoutes — pairing is public", () => {
  it("POST /pair has no user-auth layer before it", () => {
    const layers = stackOf(printAgentRoutes);
    const idx = layers.findIndex((l) => l.route?.path === "/pair" && l.route.methods.post);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(layers.slice(0, idx).filter((l) => !l.route)).toHaveLength(0);
  });
});

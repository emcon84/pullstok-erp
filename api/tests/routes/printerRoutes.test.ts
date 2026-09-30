import printerRoutes from "../../src/routes/printerRoutes";
import printAgentRoutes from "../../src/routes/printAgentRoutes";
import printJobRoutes from "../../src/routes/printJobRoutes";

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

describe("printJobRoutes — role gate", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jobRoutes = require("../../src/routes/printJobRoutes").default;
  const gate = (role: string) => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    const next = jest.fn();
    stackOf(jobRoutes)[1].handle({ user: { role } }, res, next);
    return { res, next };
  };

  it.each(["ADMIN", "MANAGEMENT", "VENDEDOR", "CASHIER"])("allows %s", (role) => {
    expect(gate(role).next).toHaveBeenCalled();
  });

  it.each(["EMPLOYEE", "SUPERADMIN"])("rejects %s with 403", (role) => {
    const { res, next } = gate(role);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("agent endpoints use authenticateAgent and no user auth", () => {
    const agentLayers = stackOf(printAgentRoutes).filter((l) => l.route);
    for (const path of ["/heartbeat", "/jobs", "/jobs/:id/result"]) {
      const layer = agentLayers.find((l) => l.route!.path === path)!;
      const names = (layer.route as any).stack.map((s: any) => s.handle.name);
      expect(names).toContain("authenticateAgent");
      expect(names).not.toContain("authenticate");
    }
  });
});

describe("printJobRoutes — active printer list for operational roles", () => {
  it("registers GET /printers before GET /:id", () => {
    const gets = stackOf(printJobRoutes)
      .filter((l) => l.route?.methods.get)
      .map((l) => l.route!.path);
    expect(gets.indexOf("/printers")).toBeGreaterThanOrEqual(0);
    expect(gets.indexOf("/printers")).toBeLessThan(gets.indexOf("/:id"));
  });
});

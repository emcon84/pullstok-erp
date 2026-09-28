// Verifica que CustomerAccountMovement (libro de cuenta corriente) esté en
// TENANT_MODELS: la extensión de db.ts le inyecta organizationId y bloquea las
// operaciones singulares (findUnique/update/delete/upsert).

let allOperations: (p: any) => Promise<any>;

jest.mock("@prisma/adapter-pg", () => ({ PrismaPg: jest.fn() }));
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $extends: (cfg: any) => {
      allOperations = cfg.query.$allModels.$allOperations;
      return {};
    },
  })),
}));

import { runWithTenant } from "../../src/config/tenantContext";

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../../src/config/db");
});

const MODEL = "CustomerAccountMovement";

describe("CustomerAccountMovement es un modelo tenant", () => {
  it("inyecta organizationId en findMany", async () => {
    const query = jest.fn().mockResolvedValue([]);
    await runWithTenant(
      { userId: "u1", role: "ADMIN", organizationId: "org-1" },
      () =>
        allOperations({
          model: MODEL,
          operation: "findMany",
          args: { where: { customerId: "c1" } },
          query,
        }),
    );
    expect(query).toHaveBeenCalledWith({
      where: { customerId: "c1", organizationId: "org-1" },
    });
  });

  it("inyecta organizationId en create", async () => {
    const query = jest.fn().mockResolvedValue({});
    await runWithTenant(
      { userId: "u1", role: "ADMIN", organizationId: "org-1" },
      () =>
        allOperations({
          model: MODEL,
          operation: "create",
          args: { data: { customerId: "c1" } },
          query,
        }),
    );
    expect(query).toHaveBeenCalledWith({
      data: { customerId: "c1", organizationId: "org-1" },
    });
  });

  it("bloquea findUnique (no permitido en modelos tenant)", async () => {
    await expect(
      runWithTenant(
        { userId: "u1", role: "ADMIN", organizationId: "org-1" },
        () =>
          allOperations({
            model: MODEL,
            operation: "findUnique",
            args: { where: { id: "x" } },
            query: jest.fn(),
          }),
      ),
    ).rejects.toThrow(/no permitida/);
  });

  it("bloquea el acceso sin contexto de organización", async () => {
    await expect(
      allOperations({
        model: MODEL,
        operation: "findMany",
        args: {},
        query: jest.fn(),
      }),
    ).rejects.toThrow(/sin contexto de organización/);
  });
});

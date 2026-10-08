// Verifies ProductBarcode is a tenant model: db.ts injects organizationId and
// blocks singular operations (findUnique/update/delete).

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

const run = (operation: string, args: any, query: jest.Mock) =>
  runWithTenant(
    { userId: "u1", role: "ADMIN", organizationId: "org-1" },
    () => allOperations({ model: "ProductBarcode", operation, args, query }),
  );

describe("ProductBarcode is a tenant model", () => {
  it("injects organizationId in findFirst", async () => {
    const query = jest.fn().mockResolvedValue(null);
    await run("findFirst", { where: { code: "123" } }, query);
    expect(query).toHaveBeenCalledWith({
      where: { code: "123", organizationId: "org-1" },
    });
  });

  it("blocks singular findUnique", async () => {
    const query = jest.fn();
    await expect(run("findUnique", { where: { id: "b1" } }, query)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

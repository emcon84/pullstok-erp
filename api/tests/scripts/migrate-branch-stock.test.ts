import { basePrisma } from "../../src/config/db";
import { migrateOrganizationStock } from "../../scripts/migrate-branch-stock";

/**
 * Integration tests for the branch-stock data migration script.
 *
 * Requires the dev DB (nexo_db_dev:5434). Creates throwaway organizations
 * with products and branches, runs the migration and asserts idempotency:
 * re-run must not duplicate rows nor alter values, Σ(ProductStock) must equal
 * Σ(Product.quantity), the headquarters flag must be correct and non-HQ
 * branches must stay at implicit zero.
 */
describe("migrateOrganizationStock (idempotency)", () => {
  const orgsToCleanup: string[] = [];
  let dbAvailable = true;

  const uniqueSlug = () =>
    `e2e-stock-migrate-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const createOrg = async (withCasaCentral: boolean) => {
    const org = await basePrisma.organization.create({
      data: { name: "E2E Stock Migrate", slug: uniqueSlug() },
    });
    orgsToCleanup.push(org.id);

    await basePrisma.product.createMany({
      data: [
        { name: "Prod A", price: 10, quantity: 50, organizationId: org.id },
        { name: "Prod B", price: 20, quantity: 25, organizationId: org.id },
        { name: "Prod C", price: 30, quantity: 0, organizationId: org.id },
      ],
    });

    if (withCasaCentral) {
      await basePrisma.branch.create({
        data: { name: "Casa Central", organizationId: org.id, isActive: true },
      });
    }

    return org.id;
  };

  const hqOf = (orgId: string) =>
    basePrisma.branch.findFirst({
      where: { organizationId: orgId, isHeadquarters: true },
    });

  const stocksOf = (orgId: string) =>
    basePrisma.productStock.findMany({
      where: {
        product: { organizationId: orgId },
      },
      orderBy: { productId: "asc" },
    });

  beforeAll(async () => {
    try {
      await basePrisma.$queryRaw`SELECT 1`;
    } catch {
      console.warn("[SKIP] Dev DB no disponible — test de integración omitido");
      dbAvailable = false;
    }
  }, 20000);

  afterAll(async () => {
    for (const orgId of orgsToCleanup) {
      await basePrisma.productStock.deleteMany({
        where: { product: { organizationId: orgId } },
      });
      await basePrisma.branch.deleteMany({ where: { organizationId: orgId } });
      await basePrisma.product.deleteMany({ where: { organizationId: orgId } });
      await basePrisma.organization.deleteMany({ where: { id: orgId } });
    }
    await basePrisma.$disconnect();
  }, 20000);

  it("creates the headquarters branch and moves global quantity to its ProductStock", async () => {
    if (!dbAvailable) return;
    const orgId = await createOrg(false);

    const result = await migrateOrganizationStock(orgId);

    expect(result.migrated).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.verified).toBe(true);

    const hq = await hqOf(orgId);
    expect(hq).not.toBeNull();
    expect(hq!.isHeadquarters).toBe(true);

    const stocks = await stocksOf(orgId);
    expect(stocks).toHaveLength(3);
    // Σ(ProductStock) == Σ(Product.quantity): 50 + 25 + 0 = 75
    const sumStocks = stocks.reduce((acc, s) => acc + s.quantity, 0);
    expect(sumStocks).toBe(75);
    for (const s of stocks) {
      expect(s.branchId).toBe(hq!.id);
    }
  });

  it("re-run is a no-op: no duplicate rows, no value changes, all skipped", async () => {
    if (!dbAvailable) return;
    const orgId = await createOrg(false);
    await migrateOrganizationStock(orgId);

    const before = await stocksOf(orgId);
    expect(before).toHaveLength(3);

    const result = await migrateOrganizationStock(orgId);

    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.verified).toBe(true);

    const after = await stocksOf(orgId);
    expect(after).toHaveLength(3); // sin duplicados
    expect(after.map((s) => s.quantity)).toEqual(before.map((s) => s.quantity));
  });

  it("reuses an existing 'Casa Central' branch as headquarters when no flag is set", async () => {
    if (!dbAvailable) return;
    const orgId = await createOrg(true);

    const result = await migrateOrganizationStock(orgId);

    const hq = await hqOf(orgId);
    expect(hq).not.toBeNull();
    expect(hq!.id).toBe(result.headquartersBranchId);
    expect(hq!.name).toBe("Casa Central");
    expect(hq!.isHeadquarters).toBe(true);
  });

  it("keeps non-HQ branches at implicit zero (no rows created for them)", async () => {
    if (!dbAvailable) return;
    const orgId = await createOrg(false);
    const sucursal = await basePrisma.branch.create({
      data: { name: "Sucursal 1", organizationId: orgId, isActive: true },
    });

    await migrateOrganizationStock(orgId);

    const stocksInSucursal = await basePrisma.productStock.findMany({
      where: { branchId: sucursal.id },
    });
    expect(stocksInSucursal).toHaveLength(0);
  });
});

import request from "supertest";
import app from "../../src/app";
import { basePrisma } from "../../src/config/db";

/**
 * E2E tests for Pricing Settings API (venta-alimento-suelto):
 * GET/PUT /api/pricing-settings, factor save recompute, override preservation,
 * org isolation, 403 BASIC plan gate, role gate (MANAGEMENT ok, VENDEDOR 403).
 *
 * Requires a running database with SUPERADMIN seed (runs on the VPS only).
 */
describe("E2E: Pricing Settings (venta-alimento-suelto)", () => {
  const superadminEmail =
    process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@nexo.com";
  const superadminPassword =
    process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin123";

  const slug = `e2e-pricing-${Date.now()}`;
  const adminEmail = `admin-pricing-${Date.now()}@e2e-test.com`;

  let superadminToken: string;
  let organizationId: string;
  let adminToken: string;

  let categoryId: string;
  let productWithOverrideId: string; // product WITH explicit bulkFactor → override
  let productWithoutOverrideId: string; // product WITHOUT bulkFactor → recomputed
  let productOtherOrgId: string; // product in second org → isolated

  // Second org for isolation test
  let org2Id: string;
  let admin2Token: string;

  const createOrgWithAdmin = async (
    label: string,
    slugSuffix: string,
    email: string,
    plan = "PRO",
  ): Promise<{ orgId: string; adminToken: string }> => {
    if (!superadminToken) {
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: superadminEmail, password: superadminPassword });
      superadminToken = loginRes.body.accessToken;
    }

    const orgRes = await request(app)
      .post("/api/superadmin/organizations")
      .set("Authorization", `Bearer ${superadminToken}`)
      .send({
        organizationName: label,
        slug: `${slugSuffix}-${Date.now()}`,
        adminEmail: email,
        adminPassword: "test12345",
        plan,
      });
    const orgId = orgRes.body.id;

    const adminLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "test12345" });
    let token = adminLoginRes.body.accessToken;

    await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "test12345", newPassword: "securePass789" });

    const reloginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "securePass789" });
    token = reloginRes.body.accessToken;

    return { orgId, adminToken: token };
  };

  beforeAll(async () => {
    // 1) Create org + admin
    const { orgId, adminToken: token } = await createOrgWithAdmin(
      "Pricing E2E",
      "e2e-pricing",
      adminEmail,
    );
    organizationId = orgId;
    adminToken = token;

    // 2) Create a category
    const catRes = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ names: ["Pricing E2E Cat"] });
    categoryId = catRes.body[0].id;

    // 3) Create two products in the main org:
    //    - productWithOverrideId: has explicit bulkFactor=1.5 (should survive recompute)
    //    - productWithoutOverrideId: no bulkFactor (should be recomputed on factor save)
    const p1Res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Product With Override",
        price: 3000,
        quantity: 10,
        categoryId,
        weightKg: 10,
        bulkFactor: 1.5,
      });
    productWithOverrideId = p1Res.body.id;

    const p2Res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Product Without Override",
        price: 4500,
        quantity: 10,
        categoryId,
        weightKg: 15,
      });
    productWithoutOverrideId = p2Res.body.id;

    // 4) Create a second org for isolation test
    const org2 = await createOrgWithAdmin(
      "Pricing E2E Org2",
      "e2e-pricing-2",
      `admin-pricing-2-${Date.now()}@e2e-test.com`,
    );
    org2Id = org2.orgId;
    admin2Token = org2.adminToken;

    const cat2Res = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${admin2Token}`)
      .send({ names: ["Pricing E2E Org2 Cat"] });
    const cat2Id = cat2Res.body[0].id;

    const p3Res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${admin2Token}`)
      .send({
        name: "Product Org2",
        price: 6000,
        quantity: 5,
        categoryId: cat2Id,
        weightKg: 20,
      });
    productOtherOrgId = p3Res.body.id;
  });

  afterAll(async () => {
    const cleanOrg = async (orgId: string) => {
      if (!orgId) return;
      await basePrisma.pricingSetting
        .deleteMany({ where: { organizationId: orgId } })
        .catch(() => {});
      await basePrisma.productVariant
        .deleteMany({ where: { organizationId: orgId } })
        .catch(() => {});
      await basePrisma.categoryVariantOption
        .deleteMany({ where: { organizationId: orgId } })
        .catch(() => {});
      await basePrisma.categoryVariantDefinition
        .deleteMany({ where: { organizationId: orgId } })
        .catch(() => {});
      await basePrisma.product
        .deleteMany({ where: { organizationId: orgId } })
        .catch(() => {});
      await basePrisma.category
        .deleteMany({ where: { organizationId: orgId } })
        .catch(() => {});
      await basePrisma.user
        .deleteMany({ where: { organizationId: orgId } })
        .catch(() => {});
      await basePrisma.organization
        .deleteMany({ where: { id: orgId } })
        .catch(() => {});
    };
    await cleanOrg(organizationId);
    await cleanOrg(org2Id);
    await basePrisma.$disconnect();
  });

  // ── GET default before any config ──

  it("GET returns default 1.20 when no row exists", async () => {
    const res = await request(app)
      .get("/api/pricing-settings")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bulkFactor).toBe(1.2);
  });

  // ── dryRun preview ──

  it("PUT dryRun returns affected count + sample without writing", async () => {
    const res = await request(app)
      .put("/api/pricing-settings?dryRun=true")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ bulkFactor: 1.35 });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBeGreaterThanOrEqual(1); // productWithoutOverrideId
    expect(res.body.sample).toBeDefined();

    // GET still returns default (dryRun didn't write)
    const getRes = await request(app)
      .get("/api/pricing-settings")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.body.bulkFactor).toBe(1.2);
  });

  // ── Save factor + recompute ──

  it("PUT saves factor and recomputes products without override", async () => {
    const res = await request(app)
      .put("/api/pricing-settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ bulkFactor: 1.35 });

    expect(res.status).toBe(200);
    expect(res.body.bulkFactor).toBe(1.35);
    expect(res.body.recomputed).toBeGreaterThanOrEqual(1);

    // Verify the override product was NOT touched
    const overrideProd = await request(app)
      .get(`/api/products/${productWithOverrideId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(overrideProd.body.priceKgSuelto).toBe(
      Math.round((3000 / 10) * 1.5 * 100) / 100,
    ); // 450.00

    // Verify the non-override product WAS recomputed with new factor
    const recomputedProd = await request(app)
      .get(`/api/products/${productWithoutOverrideId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(recomputedProd.body.priceKgSuelto).toBe(
      Math.round((4500 / 15) * 1.35 * 100) / 100,
    ); // 405.00
  });

  // ── Org isolation ──

  it("factor change in org1 does NOT affect org2 products", async () => {
    const beforeRes = await request(app)
      .get(`/api/products/${productOtherOrgId}`)
      .set("Authorization", `Bearer ${admin2Token}`);
    const beforePriceKgSuelto = beforeRes.body.priceKgSuelto;

    // Change factor in org1 again
    await request(app)
      .put("/api/pricing-settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ bulkFactor: 1.5 });

    // org2 product should be unchanged
    const afterRes = await request(app)
      .get(`/api/products/${productOtherOrgId}`)
      .set("Authorization", `Bearer ${admin2Token}`);
    expect(afterRes.body.priceKgSuelto).toBe(beforePriceKgSuelto);
  });

  // ── 403 BASIC plan gate ──

  it("PUT returns 403 for BASIC plan org", async () => {
    const basic = await createOrgWithAdmin(
      "Pricing E2E Basic",
      "e2e-pricing-basic",
      `admin-pricing-basic-${Date.now()}@e2e-test.com`,
      "BASICO",
    );

    const res = await request(app)
      .put("/api/pricing-settings")
      .set("Authorization", `Bearer ${basic.adminToken}`)
      .send({ bulkFactor: 1.5 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("PLAN_LIMIT");

    // Cleanup the basic org
    await basePrisma.user
      .deleteMany({ where: { organizationId: basic.orgId } })
      .catch(() => {});
    await basePrisma.organization
      .deleteMany({ where: { id: basic.orgId } })
      .catch(() => {});
  });

  // ── Role gate: MANAGEMENT ok, VENDEDOR 403 ──

  it("MANAGEMENT can PUT pricing settings", async () => {
    const mgmtEmail = `mgmt-pricing-${Date.now()}@e2e-test.com`;
    await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Manager Pricing",
        email: mgmtEmail,
        password: "mgmtPass1",
        role: "MANAGEMENT",
      });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: mgmtEmail, password: "mgmtPass1" });
    const mgmtToken = loginRes.body.requirePasswordChange
      ? (
          await (async () => {
            await request(app)
              .post("/api/auth/change-password")
              .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
              .send({
                currentPassword: "mgmtPass1",
                newPassword: "mgmtPass2",
              });
            const r = await request(app)
              .post("/api/auth/login")
              .send({ email: mgmtEmail, password: "mgmtPass2" });
            return r;
          })()
        ).body.accessToken
      : loginRes.body.accessToken;

    const res = await request(app)
      .put("/api/pricing-settings")
      .set("Authorization", `Bearer ${mgmtToken}`)
      .send({ bulkFactor: 1.25 });

    expect(res.status).toBe(200);
    expect(res.body.bulkFactor).toBe(1.25);
  });

  it("VENDEDOR cannot PUT pricing settings (403)", async () => {
    const vendorEmail = `vendor-pricing-${Date.now()}@e2e-test.com`;
    await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Vendor Pricing",
        email: vendorEmail,
        password: "vendorPass1",
        role: "VENDEDOR",
      });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: vendorEmail, password: "vendorPass1" });
    const vendorToken = loginRes.body.requirePasswordChange
      ? (
          await (async () => {
            await request(app)
              .post("/api/auth/change-password")
              .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
              .send({
                currentPassword: "vendorPass1",
                newPassword: "vendorPass2",
              });
            const r = await request(app)
              .post("/api/auth/login")
              .send({ email: vendorEmail, password: "vendorPass2" });
            return r;
          })()
        ).body.accessToken
      : loginRes.body.accessToken;

    const res = await request(app)
      .put("/api/pricing-settings")
      .set("Authorization", `Bearer ${vendorToken}`)
      .send({ bulkFactor: 2.0 });

    expect(res.status).toBe(403);
  });
});

import request from "supertest";
import app from "../../src/app";
import { basePrisma } from "../../src/config/db";

/**
 * E2E tests for loose pet-food sale (venta-alimento-suelto):
 * kg sale, por-monto reconciliation, mixed BOLSA+PESO carts, and
 * 422 LOOSE_NOT_ELIGIBLE / LOOSE_REQUIRES_BRANCH gates.
 *
 * Requires a running database with SUPERADMIN seed (runs on the VPS only).
 */
describe("E2E: Loose Sale (venta-alimento-suelto)", () => {
  const superadminEmail =
    process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@nexo.com";
  const superadminPassword =
    process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin123";

  const slug = `e2e-loose-sale-${Date.now()}`;
  const adminEmail = `admin-loose-sale-${Date.now()}@e2e-test.com`;

  let superadminToken: string;
  let organizationId: string;
  let adminToken: string;

  let categoryId: string;
  let branchId: string;
  let vendorToken: string;

  // Product with priceKgSuelto configured (loose-eligible)
  let productKgId: string;
  // Product WITHOUT priceKgSuelto (NOT loose-eligible)
  let productBolsaId: string;

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
      "Loose Sale E2E",
      "e2e-loose-sale",
      adminEmail,
    );
    organizationId = orgId;
    adminToken = token;

    // 2) Create a category
    const catRes = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ names: ["Alimento Suelto E2E"] });
    categoryId = catRes.body[0].id;

    // 3) Create a branch + vendor so we can test branch-scoped loose sale
    const branchRes = await request(app)
      .post("/api/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Sucursal Suelta E2E",
        address: "Calle Falsa 123",
        city: "Test City",
        phone: "1112345678",
      });
    branchId = branchRes.body.id;

    // Create a vendor user assigned to that branch
    const vendorEmail = `vendor-loose-sale-${Date.now()}@e2e-test.com`;
    await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Vendedor Suelto E2E",
        email: vendorEmail,
        password: "vendorPass1",
        role: "VENDEDOR",
        branchId,
      });

    const vendorLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: vendorEmail, password: "vendorPass1" });

    // The vendor may be forced to change password first — handle both cases
    if (vendorLoginRes.body.requirePasswordChange) {
      await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${vendorLoginRes.body.accessToken}`)
        .send({
          currentPassword: "vendorPass1",
          newPassword: "vendorPass2",
        });
      const reloginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: vendorEmail, password: "vendorPass2" });
      vendorToken = reloginRes.body.accessToken;
    } else {
      vendorToken = vendorLoginRes.body.accessToken;
    }

    // 4) Create two products:
    //    - productKgId: loose-eligible (has priceKgSuelto + weightKg + stock)
    //    - productBolsaId: closed-bag only (no priceKgSuelto)
    const pKgRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Alimento Suelto Test",
        price: 4500,
        quantity: 0,
        categoryId,
        weightKg: 15,
        bulkFactor: 1.2,
      });
    productKgId = pKgRes.body.id;

    const pBolsaRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Alimento Bolsa Test",
        price: 5000,
        quantity: 10,
        categoryId,
      });
    productBolsaId = pBolsaRes.body.id;

    // 5) Stock the loose product in the branch (15 kg)
    await request(app)
      .post(`/api/branches/${branchId}/stock`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        productId: productKgId,
        quantity: 15,
      });
  });

  afterAll(async () => {
    if (organizationId) {
      await basePrisma.pricingSetting
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.productStock
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.saleItem
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.sale
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.productVariant
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.categoryVariantOption
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.categoryVariantDefinition
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.product
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.category
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.branch
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.user
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.organization
        .deleteMany({ where: { id: organizationId } })
        .catch(() => {});
    }
    await basePrisma.$disconnect();
  });

  // ── 6.1: kg sale stores decimal qty + cents total ──

  it("kg sale (POR_PESO): stores decimal quantity and round2 total", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${vendorToken}`)
      .send({
        products: [
          {
            productId: productKgId,
            name: "Alimento Suelto Test",
            quantity: "2.35",
            price: 360, // priceKgSuelto = round2(4500/15*1.2) = 360
            category: "Alimento Suelto E2E",
            saleMode: "POR_PESO",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(846); // round2(2.35 * 360) = 846.00
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(2.35);
    expect(res.body.items[0].saleMode).toBe("POR_PESO");
  });

  // ── 6.1 (cont): por-monto reconciliation ──

  it("por-monto sale (POR_MONTO): stores kg and total reproduces exactly", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${vendorToken}`)
      .send({
        products: [
          {
            productId: productKgId,
            name: "Alimento Suelto Test",
            quantity: "500", // "dame $500 de este alimento"
            price: 360,
            category: "Alimento Suelto E2E",
            saleMode: "POR_MONTO",
          },
        ],
      });

    expect(res.status).toBe(201);

    const item = res.body.items[0];
    // kg = round2(500 / 360) = round2(1.3888...) = 1.39
    const expectedKg = Math.round((500 / 360) * 100) / 100;
    expect(item.quantity).toBe(expectedKg);

    // total = round2(kg * priceKgSuelto)
    const expectedTotal = Math.round(expectedKg * 360 * 100) / 100;
    expect(res.body.total).toBe(expectedTotal);
  });

  // ── 6.1 (cont): mixed BOLSA + PESO cart ──

  it("mixed BOLSA_CERRADA + POR_PESO cart: totals sum correctly", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${vendorToken}`)
      .send({
        products: [
          {
            productId: productBolsaId,
            name: "Alimento Bolsa Test",
            quantity: "2",
            price: 5000,
            category: "Alimento Suelto E2E",
            saleMode: "BOLSA_CERRADA",
          },
          {
            productId: productKgId,
            name: "Alimento Suelto Test",
            quantity: "1.5",
            price: 360,
            category: "Alimento Suelto E2E",
            saleMode: "POR_PESO",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
    // 2 * 5000 = 10000 + 1.5 * 360 = 540 → 10540
    expect(res.body.total).toBe(10540);
  });

  // ── 6.1 (cont): LOOSE_NOT_ELIGIBLE gate ──

  it("422 LOOSE_NOT_ELIGIBLE when product has no priceKgSuelto", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${vendorToken}`)
      .send({
        products: [
          {
            productId: productBolsaId,
            name: "Alimento Bolsa Test",
            quantity: "1.5",
            price: 5000,
            category: "Alimento Suelto E2E",
            saleMode: "POR_PESO",
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.code || res.body.error).toMatch(/LOOSE_NOT_ELIGIBLE/i);
  });

  // ── 6.1 (cont): LOOSE_REQUIRES_BRANCH gate (admin has no branch) ──

  it("422 LOOSE_REQUIRES_BRANCH when loose sale has no seller branch", async () => {
    // Admin has no branch assigned → loose sale should be rejected
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        products: [
          {
            productId: productKgId,
            name: "Alimento Suelto Test",
            quantity: "1",
            price: 360,
            category: "Alimento Suelto E2E",
            saleMode: "POR_PESO",
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.code || res.body.error).toMatch(/LOOSE_REQUIRES_BRANCH/i);
  });
});

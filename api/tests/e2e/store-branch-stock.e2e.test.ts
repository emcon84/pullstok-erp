import request from "supertest";
import app from "../../src/app";
import { basePrisma } from "../../src/config/db";

/**
 * E2E — Tienda online usa el stock de la sucursal configurada (spec S1).
 *
 * Requiere la DB dev (nexo_db_dev:5434) con SUPERADMIN seed. Si la DB no
 * responde, TODA la suite hace SKIP (patrón del repo, ver
 * tests/e2e/branch-stock.e2e.test.ts). NO levanta Docker.
 *
 * Setup:
 *  - Org A (sujeto de prueba): HQ + Sucursal 2 (activas), plan PRO (la tienda
 *    pública exige PRO/PREMIUM — checkStoreEnabled), producto publicado con
 *    ProductStock(HQ)=10 y ProductStock(Sucursal 2)=3 (Product.quantity=10).
 *  - Org B: sucursal ajena para verificar que el PUT de store-settings la
 *    rechaza (la sucursal debe pertenecer a la org).
 */
describe("E2E: store branch stock — catálogo/detalle/checkout con sucursal configurada (S1)", () => {
  const superadminEmail =
    process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@nexo.com";
  const superadminPassword =
    process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin123";

  let dbAvailable = true;

  let organizationId: string;
  let slug: string;
  let hqBranchId: string;
  let sucursal2Id: string;
  let foreignBranchId: string;
  let productId: string;
  let adminToken: string;

  const uniqueSlug = (label: string) =>
    `e2e-store-branch-${label}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const uniqueEmail = (label: string) =>
    `${label}-${Date.now()}@e2e-test.com`;

  /** Crea una org vía SUPERADMIN y devuelve { id, slug, adminEmail }. */
  const createOrg = async (superadminToken: string, label: string) => {
    const adminEmail = uniqueEmail(`admin-${label}`);
    const res = await request(app)
      .post("/api/superadmin/organizations")
      .set("Authorization", `Bearer ${superadminToken}`)
      .send({
        organizationName: `E2E Store Branch ${label}`,
        slug: uniqueSlug(label),
        adminEmail,
        adminPassword: "temporal123",
      });
    expect(res.status).toBe(201);
    return { id: res.body.id as string, slug: res.body.slug as string, adminEmail };
  };

  /** Login + cambio de contraseña (admin inicial nace con mustChangePassword=true). */
  const loginAndUnblock = async (email: string, password: string) => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.accessToken as string;

    await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: "securePass456" });

    const reloginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "securePass456" });
    expect(reloginRes.status).toBe(200);
    return reloginRes.body.accessToken as string;
  };

  /** PUT /api/store-settings (ADMIN) con el storeBranchId dado (null = limpiar). */
  const setStoreBranch = (branchId: string | null) =>
    request(app)
      .put("/api/store-settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ storeBranchId: branchId });

  beforeAll(async () => {
    // ── Guard: si la DB no responde, toda la suite hace SKIP ──
    try {
      await basePrisma.$queryRaw`SELECT 1`;
    } catch {
      console.warn("[SKIP] Dev DB no disponible — e2e store-branch-stock omitido");
      dbAvailable = false;
      return;
    }

    // SUPERADMIN login (orgs y usuarios se crean vía API de plataforma)
    const superadminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: superadminEmail, password: superadminPassword });
    if (superadminLogin.status !== 200) {
      console.warn(
        `[SKIP] SUPERADMIN login falló (status ${superadminLogin.status}) — DB seed incompleta`,
      );
      dbAvailable = false;
      return;
    }
    const superadminToken = superadminLogin.body.accessToken as string;

    // ── Org A (sujeto de prueba) ──
    const orgA = await createOrg(superadminToken, "a");
    organizationId = orgA.id;
    slug = orgA.slug;
    adminToken = await loginAndUnblock(orgA.adminEmail, "temporal123");

    // La tienda pública requiere plan PRO/PREMIUM (checkStoreEnabled).
    const planRes = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/plan`)
      .set("Authorization", `Bearer ${superadminToken}`)
      .send({ plan: "PRO" });
    expect(planRes.status).toBe(200);

    // Branches: HQ + Sucursal 2 (ambas activas)
    const hq = await basePrisma.branch.create({
      data: { name: "Casa Central", organizationId, isActive: true, isHeadquarters: true },
    });
    hqBranchId = hq.id;
    const s2 = await basePrisma.branch.create({
      data: { name: "Sucursal 2", organizationId, isActive: true },
    });
    sucursal2Id = s2.id;

    // Producto publicado con stock en HQ=10 y Sucursal 2=3 (legacy quantity=10)
    const product = await basePrisma.product.create({
      data: {
        name: "E2E Store Product",
        price: 100,
        quantity: 10,
        organizationId,
        publishedToStore: true,
      },
    });
    productId = product.id;
    await basePrisma.productStock.createMany({
      data: [
        { productId, branchId: hqBranchId, quantity: 10, organizationId },
        { productId, branchId: sucursal2Id, quantity: 3, organizationId },
      ],
    });

    // ── Org B: sucursal ajena (cross-org → el PUT de settings debe dar 400) ──
    const orgB = await createOrg(superadminToken, "b");
    const foreignBranch = await basePrisma.branch.create({
      data: { name: "Sucursal Ajena", organizationId: orgB.id, isActive: true },
    });
    foreignBranchId = foreignBranch.id;
  }, 30000);

  afterAll(async () => {
    if (!dbAvailable) return;
    if (organizationId) {
      await basePrisma.productStock.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.orderItem.deleteMany({
        where: { order: { organizationId } },
      }).catch(() => {});
      await basePrisma.order.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.storeSettings.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.branch.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.product.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.customer.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.counter.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.user.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => {});
    }
    await basePrisma.$disconnect();
  }, 20000);

  it("S1: catálogo y detalle leen ProductStock de la sucursal configurada (storeBranchId=Sucursal 2, stock=3)", async () => {
    if (!dbAvailable) return;

    const put = await setStoreBranch(sucursal2Id);
    expect(put.status).toBe(200);
    expect(put.body.storeBranchId).toBe(sucursal2Id);

    const catalog = await request(app)
      .get("/api/store/products")
      .set("X-Tenant-Slug", slug);
    expect(catalog.status).toBe(200);
    const prod = catalog.body.find((p: any) => p.id === productId);
    expect(prod.quantity).toBe(3); // stock de Sucursal 2, NO el legacy 10

    const detail = await request(app)
      .get(`/api/store/products/${productId}`)
      .set("X-Tenant-Slug", slug);
    expect(detail.status).toBe(200);
    expect(detail.body.quantity).toBe(3);
  });

  it("S1: checkout con quantity > stock de la sucursal configurada → 409", async () => {
    if (!dbAvailable) return;
    await setStoreBranch(sucursal2Id);

    const res = await request(app)
      .post("/api/store/checkout")
      .set("X-Tenant-Slug", slug)
      .send({
        customer: {
          name: "Comprador E2E",
          email: uniqueEmail("checkout"),
          phone: "1155550000",
        },
        items: [{ productId, quantity: 4 }], // Sucursal 2 tiene 3
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Stock insuficiente");
  });

  it("S1: sin storeBranchId → fallback a casa central (stock HQ=10) en catálogo y detalle", async () => {
    if (!dbAvailable) return;

    const put = await setStoreBranch(null);
    expect(put.status).toBe(200);
    expect(put.body.storeBranchId).toBeNull();

    const catalog = await request(app)
      .get("/api/store/products")
      .set("X-Tenant-Slug", slug);
    expect(catalog.status).toBe(200);
    const prod = catalog.body.find((p: any) => p.id === productId);
    expect(prod.quantity).toBe(10); // casa central

    const detail = await request(app)
      .get(`/api/store/products/${productId}`)
      .set("X-Tenant-Slug", slug);
    expect(detail.body.quantity).toBe(10);
  });

  it("S1: checkout contra la casa central (quantity 4 ≤ HQ 10) → 201", async () => {
    if (!dbAvailable) return;
    await setStoreBranch(null);

    const res = await request(app)
      .post("/api/store/checkout")
      .set("X-Tenant-Slug", slug)
      .send({
        customer: {
          name: "Comprador E2E",
          email: uniqueEmail("checkout-ok"),
          phone: "1155550001",
        },
        items: [{ productId, quantity: 4 }], // HQ tiene 10
      });

    expect(res.status).toBe(201);
  });

  it("S2: PUT store-settings con sucursal de OTRA org → 400 (validación de pertenencia)", async () => {
    if (!dbAvailable) return;
    const res = await setStoreBranch(foreignBranchId);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("sucursal");
  });
});

import request from "supertest";
import app from "../../src/app";
import { basePrisma } from "../../src/config/db";

/**
 * E2E — Stock por sucursal (spec A1/A2/D4).
 *
 * Requiere la DB dev (nexo_db_dev:5434) con SUPERADMIN seed. Si la DB no
 * responde, TODA la suite hace SKIP (patrón del repo, ver
 * tests/scripts/migrate-branch-stock.test.ts). NO levanta Docker.
 *
 * Setup:
 *  - Org A (sujeto de prueba): HQ + Sucursal 2 (activas) + Sucursal 3 (inactiva,
 *    para verificar que NO aparece en el GET), producto con stock HQ=10 y S2=3.
 *  - Usuarios en Org A: ADMIN, VENDEDOR asignado a Sucursal 2, VENDEDOR sin
 *    asignación, EMPLOYEE.
 *  - Org B: producto + sucursal ajenos (cross-org → 404).
 */
describe("E2E: branch stock — GET/PUT /products/:id/stock (A1/A2/D4)", () => {
  const superadminEmail =
    process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@nexo.com";
  const superadminPassword =
    process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin123";

  let dbAvailable = true;

  let organizationId: string;
  let hqBranchId: string;
  let sucursal2Id: string;
  let productId: string;
  let adminToken: string;
  let vendedorToken: string;
  let vendedorSinAsignacionToken: string;
  let employeeToken: string;
  let foreignProductId: string;

  const uniqueSlug = (label: string) =>
    `e2e-branch-stock-${label}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const uniqueEmail = (label: string) =>
    `${label}-${Date.now()}@e2e-test.com`;

  /** Crea una org vía SUPERADMIN y devuelve { id, adminEmail }. */
  const createOrg = async (superadminToken: string, label: string) => {
    const adminEmail = uniqueEmail(`admin-${label}`);
    const res = await request(app)
      .post("/api/superadmin/organizations")
      .set("Authorization", `Bearer ${superadminToken}`)
      .send({
        organizationName: `E2E Branch Stock ${label}`,
        slug: uniqueSlug(label),
        adminEmail,
        adminPassword: "temporal123",
      });
    expect(res.status).toBe(201);
    return { id: res.body.id as string, adminEmail };
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

  /** Crea un usuario de la org vía API y devuelve su token (mustChangePassword=false). */
  const createUserAndToken = async (
    adminTokenLocal: string,
    role: string,
    branchIds?: string[],
  ) => {
    const email = uniqueEmail(`user-${role.toLowerCase()}`);
    const createRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminTokenLocal}`)
      .send({ email, password: "password123", role, branchIds });
    expect(createRes.status).toBe(201);

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });
    expect(loginRes.status).toBe(200);
    return loginRes.body.accessToken as string;
  };

  beforeAll(async () => {
    // ── Guard: si la DB no responde, toda la suite hace SKIP ──
    try {
      await basePrisma.$queryRaw`SELECT 1`;
    } catch {
      console.warn("[SKIP] Dev DB no disponible — e2e branch-stock omitido");
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
    adminToken = await loginAndUnblock(orgA.adminEmail, "temporal123");

    // El beforeAll crea 4 usuarios en Org A (admin + vendedor asignado +
    // vendedor sin asignación + employee). BASICO topa en maxUsers=2
    // (checkUserLimit responde 403 PLAN_LIMIT), así que la org de prueba
    // debe correr en PRO (maxUsers=10) — misma estrategia que
    // store-branch-stock.e2e.test.ts.
    const planRes = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/plan`)
      .set("Authorization", `Bearer ${superadminToken}`)
      .send({ plan: "PRO" });
    expect(planRes.status).toBe(200);

    // Branches: HQ + Sucursal 2 (activas) + Sucursal 3 (inactiva)
    const hq = await basePrisma.branch.create({
      data: { name: "Casa Central", organizationId, isActive: true, isHeadquarters: true },
    });
    hqBranchId = hq.id;
    const s2 = await basePrisma.branch.create({
      data: { name: "Sucursal 2", organizationId, isActive: true },
    });
    sucursal2Id = s2.id;
    await basePrisma.branch.create({
      data: { name: "Sucursal 3 (inactiva)", organizationId, isActive: false },
    });

    // Producto con stock en HQ=10 y Sucursal 2=3 (Product.quantity legacy=10)
    const product = await basePrisma.product.create({
      data: { name: "E2E Stock Product", price: 100, quantity: 10, organizationId },
    });
    productId = product.id;
    await basePrisma.productStock.createMany({
      data: [
        { productId, branchId: hqBranchId, quantity: 10, organizationId },
        { productId, branchId: sucursal2Id, quantity: 3, organizationId },
      ],
    });

    // Usuarios: vendedor (asignado a Sucursal 2), vendedor sin asignación, employee
    vendedorToken = await createUserAndToken(adminToken, "VENDEDOR", [sucursal2Id]);
    vendedorSinAsignacionToken = await createUserAndToken(adminToken, "VENDEDOR");
    employeeToken = await createUserAndToken(adminToken, "EMPLOYEE");

    // ── Org B: producto y sucursal ajenos (cross-org → 404) ──
    const orgB = await createOrg(superadminToken, "b");
    const foreignProduct = await basePrisma.product.create({
      data: {
        name: "E2E Foreign Product",
        price: 50,
        quantity: 1,
        organizationId: orgB.id,
      },
    });
    foreignProductId = foreignProduct.id;
  }, 30000);

  afterAll(async () => {
    if (!dbAvailable) return;
    if (organizationId) {
      await basePrisma.productStock.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.branchAssignment.deleteMany({ where: { user: { organizationId } } }).catch(() => {});
      await basePrisma.branch.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.product.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.user.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => {});
    }
    await basePrisma.$disconnect();
  }, 20000);

  // ══════════════════════════════════════════════════════════
  // A1 — GET /products/:id/stock (cualquier rol autenticado)
  // ══════════════════════════════════════════════════════════
  describe("A1: GET stock", () => {
    it("admin: 200 con una entrada por sucursal ACTIVA, canEdit=true en todas", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .get(`/api/products/${productId}/stock`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.productId).toBe(productId);
      expect(res.body.branches).toHaveLength(2); // la inactiva no entra
      const hq = res.body.branches.find((b: any) => b.branchId === hqBranchId);
      expect(hq).toMatchObject({
        branchName: "Casa Central",
        quantity: 10,
        isHeadquarters: true,
        canEdit: true,
      });
      const s2 = res.body.branches.find((b: any) => b.branchId === sucursal2Id);
      expect(s2).toMatchObject({ quantity: 3, canEdit: true });
    });

    it("vendedor: 200 con canEdit solo en su sucursal asignada", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .get(`/api/products/${productId}/stock`)
        .set("Authorization", `Bearer ${vendedorToken}`);

      expect(res.status).toBe(200);
      const hq = res.body.branches.find((b: any) => b.branchId === hqBranchId);
      const s2 = res.body.branches.find((b: any) => b.branchId === sucursal2Id);
      expect(hq.canEdit).toBe(false);
      expect(s2.canEdit).toBe(true);
    });

    it("employee: 200 con todo en solo lectura (canEdit=false)", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .get(`/api/products/${productId}/stock`)
        .set("Authorization", `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.branches.length).toBeGreaterThan(0);
      for (const b of res.body.branches) {
        expect(b.canEdit).toBe(false);
      }
    });

    it("producto de otra org (cross-org) → 404 sin filtrar datos", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .get(`/api/products/${foreignProductId}/stock`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════════════
  // A2 — PUT /products/:id/stock/:branchId (autorización server-side)
  // ══════════════════════════════════════════════════════════
  describe("A2: PUT stock", () => {
    it("admin: 200 en cualquier sucursal", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .put(`/api/products/${productId}/stock/${sucursal2Id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ quantity: 15 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ branchId: sucursal2Id, quantity: 15 });
    });

    it("vendedor: 200 en SU sucursal", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .put(`/api/products/${productId}/stock/${sucursal2Id}`)
        .set("Authorization", `Bearer ${vendedorToken}`)
        .send({ quantity: 8 });

      expect(res.status).toBe(200);
    });

    it("vendedor: 403 en sucursal que NO es suya", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .put(`/api/products/${productId}/stock/${hqBranchId}`)
        .set("Authorization", `Bearer ${vendedorToken}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(403);
    });

    it("vendedor sin asignación: 403 en cualquier sucursal", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .put(`/api/products/${productId}/stock/${sucursal2Id}`)
        .set("Authorization", `Bearer ${vendedorSinAsignacionToken}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(403);
    });

    it("employee: 403 siempre", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .put(`/api/products/${productId}/stock/${sucursal2Id}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(403);
    });

    it("quantity negativa (-3) → 400 vía Zod y ningún stock cambia", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .put(`/api/products/${productId}/stock/${sucursal2Id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ quantity: -3 });

      expect(res.status).toBe(400);
    });

    it("producto de otra org (cross-org) → 404", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .put(`/api/products/${foreignProductId}/stock/${sucursal2Id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════════════
  // D4 — Product.quantity legacy se sincroniza SOLO con la HQ
  // ══════════════════════════════════════════════════════════
  describe("D4: sincronización con Product.quantity", () => {
    it("PUT en HQ: actualiza ProductStock(HQ) y Product.quantity", async () => {
      if (!dbAvailable) return;
      const res = await request(app)
        .put(`/api/products/${productId}/stock/${hqBranchId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ quantity: 25 });

      expect(res.status).toBe(200);
      const product = await basePrisma.product.findFirst({
        where: { id: productId },
      });
      expect(product!.quantity).toBe(25);
      const hqStock = await basePrisma.productStock.findFirst({
        where: { productId, branchId: hqBranchId },
      });
      expect(hqStock!.quantity).toBe(25);
    });

    it("PUT en sucursal NO-HQ: cambia su ProductStock pero NO toca Product.quantity", async () => {
      if (!dbAvailable) return;
      // Precondición: Product.quantity quedó en 25 por el test anterior.
      await request(app)
        .put(`/api/products/${productId}/stock/${sucursal2Id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ quantity: 7 });

      const product = await basePrisma.product.findFirst({
        where: { id: productId },
      });
      expect(product!.quantity).toBe(25); // legacy intacto (D4)

      const s2Stock = await basePrisma.productStock.findFirst({
        where: { productId, branchId: sucursal2Id },
      });
      expect(s2Stock!.quantity).toBe(7);
    });
  });
});

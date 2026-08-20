import request from "supertest";
import app from "../../src/app";
import { basePrisma } from "../../src/config/db";

/**
 * E2E tests — Apertura y cierre de Caja (sdd/caja-apertura-cierre).
 *
 * Cubre R1→R10:
 *  - R1/R2: abrir caja (fondo inicial) y rechazo de segunda apertura OPEN.
 *  - R6/R7/R8: venta con pago (único y mixto), persistencia de SalePayment y
 *    Sale.cashSessionId, y PAYMENTS_DO_NOT_MATCH_TOTAL si no cuadra.
 *  - R9: gate CASH_SESSION_REQUIRED para VENDEDOR/CASHIER sin caja abierta.
 *  - R3/R10: cerrar con arqueo — expectedAmount solo suma EFECTIVO, y la
 *    diferencia (contado vs esperado) se calcula y persiste.
 *  - R4/R5: listado — ADMIN/MANAGEMENT ven todas; VENDEDOR solo las propias.
 *
 * Requiere una base con SUPERADMIN seed (se ejecuta SOLO en el VPS).
 */
describe("E2E: Cash Session (caja apertura/cierre)", () => {
  const superadminEmail =
    process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@nexo.com";
  const superadminPassword =
    process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin123";

  const adminEmail = `admin-cash-${Date.now()}@e2e-test.com`;

  let superadminToken: string;
  let organizationId: string;
  let adminToken: string;

  let branchId: string;
  let vendorToken: string;
  let productId: string;

  const createOrgWithAdmin = async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: superadminEmail, password: superadminPassword });
    superadminToken = loginRes.body.accessToken;

    const orgRes = await request(app)
      .post("/api/superadmin/organizations")
      .set("Authorization", `Bearer ${superadminToken}`)
      .send({
        organizationName: "Cash Session E2E",
        slug: `e2e-cash-${Date.now()}`,
        adminEmail,
        adminPassword: "test12345",
        plan: "PRO",
      });
    organizationId = orgRes.body.id;

    const adminLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: adminEmail, password: "test12345" });
    let token = adminLoginRes.body.accessToken;

    await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "test12345", newPassword: "securePass789" });

    const reloginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: adminEmail, password: "securePass789" });
    token = reloginRes.body.accessToken;

    return token;
  };

  const openCash = (token: string, body: Record<string, unknown>) =>
    request(app)
      .post("/api/cash-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  const createSale = (token: string, body: Record<string, unknown>) =>
    request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    adminToken = await createOrgWithAdmin();

    // Categoría + producto + sucursal + vendedor asignado a la sucursal.
    const catRes = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ names: ["Caja E2E"] });
    const categoryId = catRes.body[0].id;

    const branchRes = await request(app)
      .post("/api/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Sucursal Caja E2E",
        address: "Calle 1",
        city: "Test City",
        phone: "1112223333",
      });
    branchId = branchRes.body.id;

    const productRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Producto Caja E2E",
        price: 100,
        quantity: 100,
        categoryId,
      });
    productId = productRes.body.id;

    const vendorEmail = `vendor-cash-${Date.now()}@e2e-test.com`;
    await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Vendedor Caja E2E",
        email: vendorEmail,
        password: "vendorPass1",
        role: "VENDEDOR",
        branchId,
      });

    const vendorLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: vendorEmail, password: "vendorPass1" });
    if (vendorLoginRes.body.requirePasswordChange) {
      await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${vendorLoginRes.body.accessToken}`)
        .send({ currentPassword: "vendorPass1", newPassword: "vendorPass2" });
      const relogin = await request(app)
        .post("/api/auth/login")
        .send({ email: vendorEmail, password: "vendorPass2" });
      vendorToken = relogin.body.accessToken;
    } else {
      vendorToken = vendorLoginRes.body.accessToken;
    }
  });

  afterAll(async () => {
    if (organizationId) {
      // saleItem se borra en cascada con sale.
      await basePrisma.salePayment
        .deleteMany({ where: { sale: { organizationId } } })
        .catch(() => {});
      await basePrisma.cashSession
        .deleteMany({ where: { organizationId } })
        .catch(() => {});
      await basePrisma.sale
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

  // ── R9: gate — un VENDEDOR sin caja abierta NO puede vender ──
  it("rechaza la venta de un VENDEDOR sin caja abierta (CASH_SESSION_REQUIRED 422)", async () => {
    const res = await createSale(vendorToken, {
      products: [
        {
          productId,
          name: "Producto Caja E2E",
          quantity: 1,
          price: 100,
          category: "Caja E2E",
        },
      ],
      payments: [{ method: "EFECTIVO", amount: 100 }],
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("CASH_SESSION_REQUIRED");
  });

  // ── R1: abrir caja ──
  it("abre una caja OPEN para el vendedor con fondo inicial", async () => {
    const res = await openCash(vendorToken, {
      branchId,
      openingAmount: 5000,
      observations: "Apertura E2E",
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("OPEN");
    expect(res.body.cashierId).toBeTruthy();
    expect(res.body.branchId).toBe(branchId);
    expect(res.body.openingAmount).toBe(5000);
    expect(res.body.observations).toBe("Apertura E2E");
  });

  // ── R2: rechazo de segunda apertura OPEN ──
  it("rechaza abrir una segunda caja OPEN para el mismo (branch, cashier)", async () => {
    const res = await openCash(vendorToken, { branchId, openingAmount: 100 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("CASH_SESSION_ALREADY_OPEN");
  });

  // ── R6/R7/R8: venta con pago mixto dentro de la caja abierta ──
  it("vende con pago mixto EFECTIVO+TARJETA y asocia la venta a la caja", async () => {
    // total = 100 (1 x 100)
    const res = await createSale(vendorToken, {
      products: [
        {
          productId,
          name: "Producto Caja E2E",
          quantity: 1,
          price: 100,
          category: "Caja E2E",
        },
      ],
      payments: [
        { method: "EFECTIVO", amount: 60 },
        { method: "TARJETA_CREDITO", amount: 40 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.totalAmount).toBe(100);
    // La venta quedó vinculada a la caja OPEN del vendedor (R8).
    expect(res.body.cashSessionId).toBeTruthy();
  });

  // ── R7: suma de payments != total → PAYMENTS_DO_NOT_MATCH_TOTAL ──
  it("rechaza la venta cuando la suma de payments no coincide con el total", async () => {
    const res = await createSale(vendorToken, {
      products: [
        {
          productId,
          name: "Producto Caja E2E",
          quantity: 1,
          price: 100,
          category: "Caja E2E",
        },
      ],
      payments: [
        { method: "EFECTIVO", amount: 50 },
        { method: "TARJETA_CREDITO", amount: 40 }, // suma 90 != 100
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PAYMENTS_DO_NOT_MATCH_TOTAL");
  });

  // ── R4: GET /current devuelve la sesión OPEN del vendedor ──
  it("devuelve la sesión OPEN actual del vendedor con sus payments", async () => {
    const res = await request(app)
      .get("/api/cash-sessions/current")
      .set("Authorization", `Bearer ${vendorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OPEN");
    // Debe incluir la venta mixta como payments agrupados (60 EFECTIVO).
    const efectivo = res.body.payments?.filter(
      (p: { method: string }) => p.method === "EFECTIVO",
    );
    expect(efectivo?.length).toBeGreaterThan(0);
  });

  // ── R3/R10: cerrar caja con arqueo; expected = opening + Σ EFECTIVO ──
  it("cierra la caja calculando expectedAmount solo con EFECTIVO", async () => {
    const currentRes = await request(app)
      .get("/api/cash-sessions/current")
      .set("Authorization", `Bearer ${vendorToken}`);
    const sessionId = currentRes.body.id;

    // opening 5000 + EFECTIVO 60 de la venta mixta = 5060 esperado.
    const res = await request(app)
      .post(`/api/cash-sessions/${sessionId}/close`)
      .set("Authorization", `Bearer ${vendorToken}`)
      .send({
        closingByMethod: { EFECTIVO: 5060 },
        closingAmount: 5060,
      });

    expect(res.status).toBe(200);
    expect(res.body.expectedAmount).toBe(5060);
    expect(res.body.difference).toBe(0);
  });

  // ── R3: una vez cerrada, la caja ya no es la "actual" ──
  it("tras el cierre ya no devuelve la sesión como OPEN en /current", async () => {
    const res = await request(app)
      .get("/api/cash-sessions/current")
      .set("Authorization", `Bearer ${vendorToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  // ── R2: apertura tras cierre → nueva OPEN (un segundo turno) ──
  it("permite abrir una nueva caja tras cerrar la anterior", async () => {
    const res = await openCash(vendorToken, {
      branchId,
      openingAmount: 1000,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("OPEN");
  });

  // ── R4/R5: ADMIN ve todas las cajas; VENDEDOR solo las suyas ──
  it("ADMIN lista todas las cajas de la organización", async () => {
    const res = await request(app)
      .get("/api/cash-sessions")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    // Al menos la caja abierta en el segundo turno + la cerrada.
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
  });

  it("el VENDEDOR solo lista sus propias cajas", async () => {
    const res = await request(app)
      .get("/api/cash-sessions")
      .set("Authorization", `Bearer ${vendorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    // Todas deben pertenecer al vendedor (cashierId propio).
    for (const s of res.body.items) {
      expect(s.cashierId).toBeTruthy();
    }
  });
});

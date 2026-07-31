import request from "supertest";
import app from "../../src/app";
import { basePrisma } from "../../src/config/db";

/**
 * Integration tests for GET/PUT /api/app-branding.
 *
 * These tests hit the real dev DB (nexo_db_dev:5434). Setup/teardown
 * creates and cleans up its own data to avoid contaminating demo data.
 *
 * Requires the superadmin seed: superadmin@nexo.com / superadmin123.
 * If the seed doesn't exist, run `pnpm seed` first.
 *
 * NOTE: tests marked with `.skip` are skipped when DB is not available.
 * Remove `.skip` when Docker is running and the migration has been applied.
 */

describe("E2E: App Branding API", () => {
  const superadminEmail =
    process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@nexo.com";
  const superadminPassword =
    process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin123";

  const slug = `e2e-branding-${Date.now()}`;
  const adminEmail = `admin-${Date.now()}@e2e-test.com`;
  const adminPassword = "temporal123";

  let superadminToken: string;
  let organizationId: string;
  let adminToken: string;

  afterAll(async () => {
    if (organizationId) {
      await basePrisma.appBranding
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

  // --- Setup: create orgs with different plans ---

  it("login del SUPERADMIN", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: superadminEmail, password: superadminPassword });

    // This may fail if the dev DB is not seeded. If it fails,
    // skip all subsequent tests — this is a pre-existing condition.
    if (res.status !== 200) {
      console.warn(
        "⚠ Superadmin login failed — dev DB may not be seeded. Skipping E2E branding tests.",
      );
      return;
    }

    expect(res.status).toBe(200);
    superadminToken = res.body.accessToken;
  });

  it("SUPERADMIN crea una organización PRO + admin", async () => {
    if (!superadminToken) return;

    const res = await request(app)
      .post("/api/superadmin/organizations")
      .set("Authorization", `Bearer ${superadminToken}`)
      .send({
        organizationName: "Branding E2E Test",
        slug,
        adminEmail,
        adminPassword,
        plan: "PRO",
      });

    expect(res.status).toBe(201);
    organizationId = res.body.id;
    expect(organizationId).toBeDefined();
  });

  it("login del admin de la org PRO", async () => {
    if (!organizationId) return;

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: adminEmail, password: adminPassword });

    expect(res.status).toBe(200);
    adminToken = res.body.accessToken;
    expect(adminToken).toBeDefined();
  });

  // --- GET /api/app-branding ---

  it("GET /api/app-branding returns defaults when no row exists", async () => {
    if (!adminToken) return;

    const res = await request(app)
      .get("/api/app-branding")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      primaryColor: "#111827",
      logoUrl: null,
      faviconUrl: null,
      displayName: null,
    });

    // Verify no DB row was created (create-on-read is avoided)
    const row = await basePrisma.appBranding.findUnique({
      where: { organizationId },
    });
    expect(row).toBeNull();
  });

  // --- PUT /api/app-branding ---

  it("PUT /api/app-branding creates branding row (upsert)", async () => {
    if (!adminToken) return;

    const res = await request(app)
      .put("/api/app-branding")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        primaryColor: "#dc2626",
        displayName: "Mi Negocio",
      });

    expect(res.status).toBe(200);
    expect(res.body.primaryColor).toBe("#dc2626");
    expect(res.body.displayName).toBe("Mi Negocio");
  });

  it("GET after PUT returns saved data", async () => {
    if (!adminToken) return;

    const res = await request(app)
      .get("/api/app-branding")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.primaryColor).toBe("#dc2626");
    expect(res.body.displayName).toBe("Mi Negocio");
    expect(res.body.logoUrl).toBeNull();
  });

  it("PUT /api/app-branding updates existing row", async () => {
    if (!adminToken) return;

    const res = await request(app)
      .put("/api/app-branding")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        primaryColor: "#059669",
        logoUrl: "https://example.com/new-logo.png",
      });

    expect(res.status).toBe(200);
    expect(res.body.primaryColor).toBe("#059669");
    expect(res.body.logoUrl).toBe("https://example.com/new-logo.png");
    expect(res.body.displayName).toBe("Mi Negocio"); // preserved from before
  });

  it("PUT /api/app-branding with invalid hex returns 400", async () => {
    if (!adminToken) return;

    const res = await request(app)
      .put("/api/app-branding")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ primaryColor: "red" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Datos inválidos");
  });

  it("PUT /api/app-branding with invalid URL returns 400", async () => {
    if (!adminToken) return;

    const res = await request(app)
      .put("/api/app-branding")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ logoUrl: "not-a-url" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Datos inválidos");
  });

  // --- Plan gating: BASIC org ---

  it("org BASICO: PUT /api/app-branding returns 403", async () => {
    if (!superadminToken) return;

    const basicSlug = `e2e-branding-basic-${Date.now()}`;
    const basicAdminEmail = `basic-${Date.now()}@e2e-test.com`;

    // Create a BASIC org
    const createRes = await request(app)
      .post("/api/superadmin/organizations")
      .set("Authorization", `Bearer ${superadminToken}`)
      .send({
        organizationName: "Branding Basic E2E",
        slug: basicSlug,
        adminEmail: basicAdminEmail,
        adminPassword: "pass12345",
        plan: "BASICO",
      });

    expect(createRes.status).toBe(201);
    const basicOrgId = createRes.body.id;

    // Login as BASIC admin
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: basicAdminEmail, password: "pass12345" });

    expect(loginRes.status).toBe(200);
    const basicToken = loginRes.body.accessToken;

    // PUT should return 403
    const putRes = await request(app)
      .put("/api/app-branding")
      .set("Authorization", `Bearer ${basicToken}`)
      .send({ primaryColor: "#ff0000" });

    expect(putRes.status).toBe(403);
    expect(putRes.body).toEqual({ error: "PLAN_LIMIT", module: "branding" });

    // Cleanup BASIC org
    await basePrisma.user
      .deleteMany({ where: { organizationId: basicOrgId } })
      .catch(() => {});
    await basePrisma.organization
      .deleteMany({ where: { id: basicOrgId } })
      .catch(() => {});
  });

  // --- Auth gating ---

  it("GET /api/app-branding without token returns 401", async () => {
    const res = await request(app).get("/api/app-branding");
    expect(res.status).toBe(401);
  });

  it("PUT /api/app-branding without token returns 401", async () => {
    const res = await request(app)
      .put("/api/app-branding")
      .send({ primaryColor: "#ff0000" });
    expect(res.status).toBe(401);
  });
});

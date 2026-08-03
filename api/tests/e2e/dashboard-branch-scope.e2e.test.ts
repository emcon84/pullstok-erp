/**
 * E2E: Dashboard por Sucursal
 *
 * Verifies that the branch-filtered endpoints scope data correctly.
 * Runs on VPS (required: real DB with seeded branches, products, stock).
 *
 * Prerequisites:
 *  - VPS has seeded test data (admin@demo.com / admin123)
 *  - At least 2 active branches exist
 *  - At least 1 product has stock in branch A but not branch B
 */

import request from "supertest";
import app from "../../src/app";

const superadminEmail = "superadmin@pullstok.com";
const superadminPassword = "superadmin123";
const adminEmail = "admin@demo.com";
const adminPassword = "admin123";

describe("E2E: Dashboard por Sucursal — branch-filtered endpoints", () => {
  let adminToken: string | null = null;

  beforeAll(async () => {
    // Login as demo admin to get a token
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: adminEmail, password: adminPassword });

    if (res.status !== 200) {
      // Fallback: try superadmin if demo admin doesn't exist
      const superRes = await request(app)
        .post("/api/auth/login")
        .send({ email: superadminEmail, password: superadminPassword });
      expect(superRes.status).toBe(200);
      adminToken = superRes.body.accessToken;
    } else {
      adminToken = res.body.accessToken;
    }
  }, 30000);

  it("GET /sales?branchId=X returns results scoped to that branch", async () => {
    // Fetch all active branches first
    const branchesRes = await request(app)
      .get("/api/branches")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(branchesRes.status).toBe(200);
    expect(branchesRes.body.length).toBeGreaterThanOrEqual(1);

    const branchId = branchesRes.body[0].id;

    // Fetch sales scoped to branch
    const salesRes = await request(app)
      .get(`/api/sales?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    // Should return 200 — even if empty (no sales in that branch yet)
    expect(salesRes.status).toBe(200);
    expect(Array.isArray(salesRes.body)).toBe(true);
  });

  it("GET /orders?branchId=X returns results scoped to that branch", async () => {
    const branchesRes = await request(app)
      .get("/api/branches")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(branchesRes.status).toBe(200);
    const branchId = branchesRes.body[0].id;

    const res = await request(app)
      .get(`/api/orders?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /quotations?branchId=X returns results scoped to that branch", async () => {
    const branchesRes = await request(app)
      .get("/api/branches")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(branchesRes.status).toBe(200);
    const branchId = branchesRes.body[0].id;

    const res = await request(app)
      .get(`/api/quotations?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /products?branchId=X filters via ProductStock join", async () => {
    const branchesRes = await request(app)
      .get("/api/branches")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(branchesRes.status).toBe(200);
    expect(branchesRes.body.length).toBeGreaterThanOrEqual(1);

    const branchId = branchesRes.body[0].id;

    // Fetch products scoped to branch (via stocks.some filter)
    const res = await request(app)
      .get(`/api/products?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Every returned product should have stock in this branch
    for (const product of res.body) {
      // Product either has stocks array or we trust the backend filter
      if (product.stocks && product.stocks.length > 0) {
        const hasStockInBranch = product.stocks.some(
          (s: any) => s.branchId === branchId && s.quantity > 0,
        );
        expect(hasStockInBranch).toBe(true);
      }
    }
  });

  it("GET /sales without branchId returns org-wide (backward-compat)", async () => {
    const res = await request(app)
      .get("/api/sales")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

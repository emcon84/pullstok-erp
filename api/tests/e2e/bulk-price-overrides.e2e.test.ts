import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * E2E tests for per-category & per-product percentage overrides
 * (bulk-price-overrides): precedence product > category (nearest ancestor,
 * incl. subtree inheritance) > global, 0%-override vs exclude semantics,
 * authoritative apply resolving effective % inside the transaction, tenant
 * isolation, and byte-identical regression when no overrides are sent.
 *
 * Note: variants may only live on LEAF categories (createVariant enforces it),
 * so all products sit on the leaf Collares; the parent-based inheritance is
 * proven by placing the override on ancestor Accesorios (which expands to and
 * inherits down to Collares).
 *
 * Requires a running database with SUPERADMIN seed (runs on the VPS only).
 */
describe('E2E: bulk price update overrides', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  const adminEmail = `admin-overrides-${Date.now()}@e2e-test.com`;

  let adminToken: string;
  let organizationId: string;
  let accesoriosId: string;
  let collaresId: string;
  let pAId: string;
  let pA2Id: string;
  let pBId: string;

  let org2Id: string;
  let admin2Token: string;
  let org2ProductId: string;

  const createOrgWithAdmin = async (
    label: string,
    slugSuffix: string,
    email: string,
  ): Promise<{ orgId: string; adminToken: string }> => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: superadminEmail, password: superadminPassword });
    const superadminToken = loginRes.body.accessToken;

    const orgRes = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        organizationName: label,
        slug: `${slugSuffix}-${Date.now()}`,
        adminEmail: email,
        adminPassword: 'test12345',
      });
    const orgId = orgRes.body.id;

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'test12345' });
    let token = adminLoginRes.body.accessToken;

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'test12345', newPassword: 'securePass789' });

    const reloginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'securePass789' });
    token = reloginRes.body.accessToken;

    return { orgId, adminToken: token };
  };

  beforeAll(async () => {
    const { orgId, adminToken: token } = await createOrgWithAdmin(
      'Overrides E2E',
      'e2e-overrides',
      adminEmail,
    );
    organizationId = orgId;
    adminToken = token;

    // Category tree: Accesorios (root) -> Collares (leaf, only leaf can hold variants).
    const accRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Accesorios'] });
    accesoriosId = accRes.body[0].id;

    const colRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Collares'], parentId: accesoriosId });
    collaresId = colRes.body[0].id;

    // Brand variant "Marca" on the leaf Collares, with MarcaA/MarcaB.
    const varRes = await request(app)
      .post(`/api/categories/${collaresId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Marca' });
    const marcaVariantId = varRes.body.id;

    const optARes = await request(app)
      .post(`/api/categories/variants/${marcaVariantId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'MarcaA' });
    const marcaAOptionId = optARes.body.id;

    const optBRes = await request(app)
      .post(`/api/categories/variants/${marcaVariantId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'MarcaB' });
    const marcaBOptionId = optBRes.body.id;

    // Products (all in Collares): pA (MarcaA), pA2 (MarcaA), pB (MarcaB).
    const pA = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Collar MarcaA', price: 1000, quantity: 10, categoryId: collaresId, variantOptionIds: [marcaAOptionId] });
    pAId = pA.body.id;

    const pA2 = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Collar MarcaA 2', price: 2000, quantity: 10, categoryId: collaresId, variantOptionIds: [marcaAOptionId] });
    pA2Id = pA2.body.id;

    const pB = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Collar MarcaB', price: 1500, quantity: 10, categoryId: collaresId, variantOptionIds: [marcaBOptionId] });
    pBId = pB.body.id;

    // Second org with the SAME brand value for tenant isolation.
    const org2 = await createOrgWithAdmin(
      'Overrides E2E Org2',
      'e2e-overrides-2',
      `admin-overrides-2-${Date.now()}@e2e-test.com`,
    );
    org2Id = org2.orgId;
    admin2Token = org2.adminToken;

    const col2Res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ names: ['Collares'] });
    const col2Id = col2Res.body[0].id;

    const var2Res = await request(app)
      .post(`/api/categories/${col2Id}/variants`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ name: 'Marca' });
    const var2Id = var2Res.body.id;

    const opt2Res = await request(app)
      .post(`/api/categories/variants/${var2Id}/options`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ value: 'MarcaA' });
    const opt2Id = opt2Res.body.id;

    const prod2Res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ name: 'Collar Org2', price: 5000, quantity: 3, categoryId: col2Id, variantOptionIds: [opt2Id] });
    org2ProductId = prod2Res.body.id;
  });

  afterAll(async () => {
    const cleanOrg = async (orgId: string) => {
      if (!orgId) return;
      await basePrisma.productVariant.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await basePrisma.categoryVariantOption.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await basePrisma.categoryVariantDefinition.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await basePrisma.product.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await basePrisma.category.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await basePrisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await basePrisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
    };
    await cleanOrg(organizationId);
    await cleanOrg(org2Id);
    await basePrisma.$disconnect();
  });

  // --- T1: override on ancestor inherits down to descendants (preview) ---

  it('dryRun: override on ancestor category inherits down to leaf products (T1)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [accesoriosId], // parent -> expands to Accesorios + Collares
        excludeProductIds: [],
        percentage: 10,
        categoryPercentages: [{ categoryId: accesoriosId, percentage: 20 }],
        productPercentages: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(2); // pA, pA2 (MarcaA); pB is MarcaB
    const rowA = res.body.rows.find((r: any) => r.id === pAId);
    const rowA2 = res.body.rows.find((r: any) => r.id === pA2Id);
    expect(rowA.effectivePercentage).toBe(20); // inherited from ancestor Accesorios
    expect(rowA.newPrice).toBe(1200); // 1000 * 1.20
    expect(rowA2.effectivePercentage).toBe(20);
    expect(rowA2.newPrice).toBe(2400); // 2000 * 1.20
  });

  // --- T2: product override beats category override and global ---

  it('dry-run: product override wins over category override and global (T2)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [accesoriosId],
        excludeProductIds: [],
        percentage: 10,
        categoryPercentages: [{ categoryId: accesoriosId, percentage: 20 }],
        productPercentages: [{ productId: pAId, percentage: 5 }],
      });

    expect(res.status).toBe(200);
    const rowA = res.body.rows.find((r: any) => r.id === pAId);
    const rowA2 = res.body.rows.find((r: any) => r.id === pA2Id);
    expect(rowA.effectivePercentage).toBe(5); // product override wins
    expect(rowA.newPrice).toBe(1050); // 1000 * 1.05
    expect(rowA2.effectivePercentage).toBe(20); // category override on remainder
    expect(rowA2.newPrice).toBe(2400);
  });

  // --- T3: 0% override vs exclude semantics ---

  it('dry-run: 0% override keeps price unchanged but counts; exclude removes (T3)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [accesoriosId],
        excludeProductIds: [pAId],
        percentage: 10,
        categoryPercentages: [],
        productPercentages: [{ productId: pA2Id, percentage: 0 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(1); // pA excluded; pA2 0%-override counted
    const rowA2 = res.body.rows.find((r: any) => r.id === pA2Id);
    expect(rowA2.effectivePercentage).toBe(0);
    expect(rowA2.newPrice).toBe(2000); // unchanged
    expect(rowA2.delta).toBe(0);
  });

  // --- T4: apply is authoritative and writes effective % per product ---

  it('apply writes per-product effective prices using overrides (T4)', async () => {
    // Category override +20% on Accesorios (inherits to Collares), product
    // override -50% on pB to prove product beats category/global.
    const res = await request(app)
      .post('/api/products/bulk-price-update')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA', 'MarcaB'],
        categoryIds: [accesoriosId],
        excludeProductIds: [],
        percentage: 10,
        categoryPercentages: [{ categoryId: accesoriosId, percentage: 20 }],
        productPercentages: [{ productId: pBId, percentage: -50 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(3); // pA, pA2, pB
    expect(res.body.previousTotal).toBe(4500);
    expect(res.body.newTotal).toBe(4350); // 1200 + 2400 + 750

    const listRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);
    const pA = listRes.body.find((p: any) => p.id === pAId);
    const pA2 = listRes.body.find((p: any) => p.id === pA2Id);
    const pB = listRes.body.find((p: any) => p.id === pBId);
    expect(pA.price).toBe(1200); // 1000 * 1.20 (category override inherited)
    expect(pA2.price).toBe(2400); // 2000 * 1.20
    expect(pB.price).toBe(750); // 1500 * 0.50 (product override beats category/global)
  });

  // --- T5: 0% override at apply leaves price untouched and counts ---

  it('apply: 0%-override product included but price unchanged (T5)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [accesoriosId],
        excludeProductIds: [],
        percentage: 10,
        categoryPercentages: [],
        productPercentages: [{ productId: pA2Id, percentage: 0 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(2); // pA (10%) + pA2 (0%)
    expect(res.body.newTotal).toBe(1320 + 2400); // pA 1200*1.10, pA2 unchanged 2400

    const listRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);
    const pA2 = listRes.body.find((p: any) => p.id === pA2Id);
    expect(pA2.price).toBe(2400); // untouched
  });

  // --- T6: regression — no overrides behaves exactly as before ---

  it('dry-run without overrides matches the baseline single-percentage behavior (T6)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [accesoriosId],
        excludeProductIds: [],
        percentage: 10,
        categoryPercentages: [],
        productPercentages: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(2); // pA, pA2
    expect(res.body.previousTotal).toBe(1320 + 2400);
    expect(res.body.newTotal).toBe(1452 + 2640); // both +10%
    const rows = res.body.rows;
    for (const row of rows) {
      expect(row.effectivePercentage).toBe(10);
    }
  });

  // --- T7: tenant isolation with same brand value ---

  it('org1 apply with overrides does not touch org2 products (T7)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [accesoriosId],
        excludeProductIds: [],
        percentage: 10,
        categoryPercentages: [{ categoryId: accesoriosId, percentage: 20 }],
        productPercentages: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(2); // pA, pA2

    const org2ListRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${admin2Token}`);
    const org2Prod = org2ListRes.body.find((p: any) => p.id === org2ProductId);
    expect(org2Prod).toBeDefined();
    expect(org2Prod.price).toBe(5000); // untouched by org1's override apply
  });

  // --- T8: only category overrides, no global percentage (global defaults to 0) ---

  it('dry-run without global percentage works with only category overrides (T8)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [accesoriosId],
        excludeProductIds: [],
        // percentage OMITIDO a propósito → server resuelve 0 como global.
        categoryPercentages: [{ categoryId: accesoriosId, percentage: 20 }],
        productPercentages: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(2); // pA, pA2
    const rowA = res.body.rows.find((r: any) => r.id === pAId);
    const rowA2 = res.body.rows.find((r: any) => r.id === pA2Id);
    expect(rowA.effectivePercentage).toBe(20); // inherited override, no global needed
    expect(rowA.newPrice).toBe(1200);
    expect(rowA2.effectivePercentage).toBe(20);
    expect(rowA2.newPrice).toBe(2400);
  });
});
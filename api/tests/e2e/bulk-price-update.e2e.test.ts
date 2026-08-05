import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * E2E tests for the enhanced bulk price update (bulk-price-update-selectors):
 * signed percentage, category-tree scope with subtree expansion, per-product
 * exclusion, dryRun preview, authoritative apply, 403 for non-ADMIN, and
 * tenant isolation.
 *
 * Requires a running database with SUPERADMIN seed (runs on the VPS only).
 */
describe('E2E: bulk price update selectors', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  const slug = `e2e-bulk-price-${Date.now()}`;
  const adminEmail = `admin-bulk-price-${Date.now()}@e2e-test.com`;

  let adminToken: string;
  let organizationId: string;
  let accesoriosId: string;
  let collaresId: string;
  let camasId: string;
  let marcaAOptionId: string;
  let p1Id: string;
  let p2Id: string;
  let p3Id: string;

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
      'Bulk Price E2E',
      'e2e-bulk-price',
      adminEmail,
    );
    organizationId = orgId;
    adminToken = token;

    // Category tree: Accesorios (root) -> Collares (child); Camas (root).
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

    const camRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Camas'] });
    camasId = camRes.body[0].id;

    // Brand as variant definition "Marca" on Collares with options MarcaA/MarcaB.
    const varRes = await request(app)
      .post(`/api/categories/${collaresId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Marca' });
    const marcaVariantId = varRes.body.id;

    const optARes = await request(app)
      .post(`/api/categories/variants/${marcaVariantId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'MarcaA' });
    marcaAOptionId = optARes.body.id;

    const optBRes = await request(app)
      .post(`/api/categories/variants/${marcaVariantId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'MarcaB' });
    const marcaBOptionId = optBRes.body.id;

    // Products: p1, p2, p3 in Collares (MarcaA x2, MarcaB x1).
    const p1Res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Collar MarcaA 1', price: 1000, quantity: 10, categoryId: collaresId, variantOptionIds: [marcaAOptionId] });
    p1Id = p1Res.body.id;

    const p2Res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Collar MarcaB', price: 1500, quantity: 10, categoryId: collaresId, variantOptionIds: [marcaBOptionId] });
    p2Id = p2Res.body.id;

    const p3Res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Collar MarcaA 2', price: 2000, quantity: 10, categoryId: collaresId, variantOptionIds: [marcaAOptionId] });
    p3Id = p3Res.body.id;

    // Second org with the SAME brand value to prove tenant isolation.
    const org2 = await createOrgWithAdmin(
      'Bulk Price E2E Org2',
      'e2e-bulk-price-2',
      `admin-bulk-price-2-${Date.now()}@e2e-test.com`,
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

  // --- T1: dryRun happy path + subtree expansion ---

  it('dryRun with parent category includes descendants (T1)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [accesoriosId], // parent -> expands to Accesorios + Collares
        excludeProductIds: [],
        percentage: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(2); // p1, p3 (MarcaA) only; p2 is MarcaB
    expect(res.body.total).toBe(2);
    expect(res.body.pageSize).toBe(50);
    expect(res.body.previousTotal).toBe(3000);
    expect(res.body.newTotal).toBe(3300);
    expect(res.body.rows).toHaveLength(2);
    const row = res.body.rows.find((r: any) => r.id === p1Id);
    expect(row.oldPrice).toBe(1000);
    expect(row.newPrice).toBe(1100);
    expect(row.delta).toBe(100);
  });

  it('dryRun with explicit leaf category matches same set (T1)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [collaresId],
        excludeProductIds: [],
        percentage: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(2);
  });

  // --- T2: per-product exclusion ---

  it('dryRun excludes explicitly unchecked products (T2)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [collaresId],
        excludeProductIds: [p1Id],
        percentage: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(1);
    expect(res.body.rows[0].id).toBe(p3Id);
  });

  it('dryRun with all products excluded rejects apply path later (T2)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [collaresId],
        excludeProductIds: [p1Id, p3Id],
        percentage: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(0);
  });

  // --- T3: signed percentage (decrease) ---

  it('dryRun with negative percentage computes decrease (T3)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [collaresId],
        excludeProductIds: [],
        percentage: -20,
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(2);
    const row = res.body.rows.find((r: any) => r.id === p3Id);
    expect(row.newPrice).toBe(1600); // 2000 * 0.8
    expect(row.delta).toBe(-400);
  });

  // --- T4: apply happy path (authoritative, in-transaction) ---

  it('apply updates only matching products with new prices (T4)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [collaresId],
        excludeProductIds: [p1Id], // exclude p1 from the apply
        percentage: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(1);
    expect(res.body.previousTotal).toBe(2000);
    expect(res.body.newTotal).toBe(2200);

    const listRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);
    const p1 = listRes.body.find((p: any) => p.id === p1Id);
    const p3 = listRes.body.find((p: any) => p.id === p3Id);
    expect(p1.price).toBe(1000); // excluded -> unchanged
    expect(p3.price).toBe(2200); // 2000 * 1.10
  });

  // --- T5: 403 for non-ADMIN ---

  it('non-admin (VENDEDOR) gets 403 on bulk price update (T5)', async () => {
    const email = `vendedor-bulk-${Date.now()}@e2e-test.com`;
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, password: 'password123', role: 'VENDEDOR' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password123' });
    const vendedorToken = loginRes.body.accessToken;

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${vendedorToken}`)
      .send({ currentPassword: 'password123', newPassword: 'securePass789' });

    const reloginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'securePass789' });

    const res = await request(app)
      .post('/api/products/bulk-price-update')
      .set('Authorization', `Bearer ${reloginRes.body.accessToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [collaresId],
        excludeProductIds: [],
        percentage: 10,
      });

    expect(res.status).toBe(403);
  });

  // --- T6: tenant isolation ---

  it('org1 apply does not touch org2 products with same brand value (T6)', async () => {
    // Re-apply +10% in org1 on MarcaA (org2 has a product with MarcaA too).
    const res = await request(app)
      .post('/api/products/bulk-price-update')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [collaresId],
        excludeProductIds: [],
        percentage: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(1); // only p1 (p3 was already 2200; p1 1000 -> 1100)

    const org2ListRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${admin2Token}`);
    const org2Prod = org2ListRes.body.find((p: any) => p.id === org2ProductId);
    expect(org2Prod).toBeDefined();
    expect(org2Prod.price).toBe(5000); // untouched by org1's apply
  });
});

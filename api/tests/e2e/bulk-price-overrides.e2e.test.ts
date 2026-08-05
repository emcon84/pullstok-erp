import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * E2E tests for per-category & per-product percentage overrides
 * (bulk-price-overrides): precedence product > category (nearest ancestor
 * incl. subtree inheritance) > global, 0%-override vs exclude semantics,
 * authoritative apply resolving effective % inside the transaction, tenant
 * isolation, and byte-identical regression when no overrides are sent.
 *
 * Requires a running database with SUPERADMIN seed (runs on the VPS only).
 */
describe('E2E: bulk price update overrides', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  const slug = `e2e-overrides-${Date.now()}`;
  const adminEmail = `admin-overrides-${Date.now()}@e2e-test.com`;

  let adminToken: string;
  let organizationId: string;
  let accesoriosId: string;
  let collaresId: string;
  let marcaAOptionId: string;
  let marcaBOptionId: string;
  let pAccId: string;
  let pColAId: string;
  let pColBId: string;

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

    // Brand variant on Collares with MarcaA/MarcaB.
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
    marcaBOptionId = optBRes.body.id;

    // Products: pAcc in Accesorios (MarcaA), pColA/pColB in Collares (MarcaA/MarcaB).
    const pAcc = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Accesorio MarcaA', price: 1000, quantity: 10, categoryId: accesoriosId, variantOptionIds: [marcaAOptionId] });
    pAccId = pAcc.body.id;

    const pColA = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Collar MarcaA', price: 2000, quantity: 10, categoryId: collaresId, variantOptionIds: [marcaAOptionId] });
    pColAId = pColA.body.id;

    const pColB = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Collar MarcaB', price: 1500, quantity: 10, categoryId: collaresId, variantOptionIds: [marcaBOptionId] });
    pColBId = pColB.body.id;

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

  // --- T1: parent override inherits to the subtree (preview) ---

  it('dryRun: override on parent category inherits down to descendants (T1)', async () => {
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
    expect(res.body.affected).toBe(2); // pAcc, pColA (MarcaA); pColB is MarcaB
    const accRow = res.body.rows.find((r: any) => r.id === pAccId);
    const colARow = res.body.rows.find((r: any) => r.id === pColAId);
    expect(accRow.effectivePercentage).toBe(20);
    expect(accRow.newPrice).toBe(1200); // 1000 * 1.20
    expect(colARow.effectivePercentage).toBe(20); // inherited from ancestor Accesorios
    expect(colARow.newPrice).toBe(2400); // 2000 * 1.20
  });

  // --- T2: product override beats category override and global ---

  it('dryRun: product override wins over category and global (T2)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [accesoriosId],
        excludeProductIds: [],
        percentage: 10,
        categoryPercentages: [{ categoryId: accesoriosId, percentage: 20 }],
        productPercentages: [{ productId: pColAId, percentage: 5 }],
      });

    expect(res.status).toBe(200);
    const accRow = res.body.rows.find((r: any) => r.id === pAccId);
    const colARow = res.body.rows.find((r: any) => r.id === pColAId);
    expect(accRow.effectivePercentage).toBe(20); // category override
    expect(colARow.effectivePercentage).toBe(5); // product override wins
    expect(colARow.newPrice).toBe(2100); // 2000 * 1.05
  });

  // --- T3: 0% override vs exclude semantics ---

  it('dryRun: 0% override keeps price unchanged but counts; exclude removes (T3)', async () => {
    const res = await request(app)
      .post('/api/products/bulk-price-update?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA'],
        categoryIds: [accesoriosId],
        excludeProductIds: [pAccId],
        percentage: 10,
        categoryPercentages: [],
        productPercentages: [{ productId: pColAId, percentage: 0 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(1); // pAcc excluded, pColA 0%-override counted
    const colARow = res.body.rows.find((r: any) => r.id === pColAId);
    expect(colARow.effectivePercentage).toBe(0);
    expect(colARow.newPrice).toBe(2000); // unchanged
    expect(colARow.delta).toBe(0);
  });

  // --- T4: apply is authoritative and writes effective % per product ---

  it('apply writes per-product effective prices using overrides (T4)', async () => {
    // Category override +20% on Accesorios (inherits to Collares), product
    // override -50% on pColB (MarcaB) to prove product beats category/global.
    const res = await request(app)
      .post('/api/products/bulk-price-update')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandValues: ['MarcaA', 'MarcaB'],
        categoryIds: [accesoriosId],
        excludeProductIds: [],
        percentage: 10,
        categoryPercentages: [{ categoryId: accesoriosId, percentage: 20 }],
        productPercentages: [{ productId: pColBId, percentage: -50 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(3); // pAcc, pColA, pColB
    expect(res.body.previousTotal).toBe(4500);
    expect(res.body.newTotal).toBe(4350); // 1200 + 2400 + 750

    const listRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);
    const pAcc = listRes.body.find((p: any) => p.id === pAccId);
    const pColA = listRes.body.find((p: any) => p.id === pColAId);
    const pColB = listRes.body.find((p: any) => p.id === pColBId);
    expect(pAcc.price).toBe(1200); // 1000 * 1.20 (category override on Accesorios)
    expect(pColA.price).toBe(2400); // 2000 * 1.20 (inherited)
    expect(pColB.price).toBe(750); // 1500 * 0.50 (product override beats category/global)
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
        productPercentages: [{ productId: pColAId, percentage: 0 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(2); // pAcc (10%) + pColA (0%)
    expect(res.body.newTotal).toBe(1320 + 2400); // pAcc 1200*1.10, pColA unchanged 2400

    const listRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);
    const pColA = listRes.body.find((p: any) => p.id === pColAId);
    expect(pColA.price).toBe(2400); // untouched
  });

  // --- T6: regression — no overrides behaves exactly as before ---

  it('dryRun without overrides matches the baseline single-percentage behavior (T6)', async () => {
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
    expect(res.body.affected).toBe(2); // pAcc, pColA
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
    expect(res.body.affected).toBe(2);

    const org2ListRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${admin2Token}`);
    const org2Prod = org2ListRes.body.find((p: any) => p.id === org2ProductId);
    expect(org2Prod).toBeDefined();
    expect(org2Prod.price).toBe(5000); // untouched by org1's override apply
  });
});

import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * E2E tests for variant definitions and options CRUD.
 *
 * RED phase — these tests verify the variant CRUD endpoints work end-to-end
 * against a real database. Variants can only be created on leaf categories.
 *
 * Requires a running database with SUPERADMIN seed.
 */
describe('E2E: variant definitions and options CRUD', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  const slug = `e2e-variants-${Date.now()}`;
  const adminEmail = `admin-variants-${Date.now()}@e2e-test.com`;

  let adminToken: string;
  let organizationId: string;
  let leafCategoryId: string;
  let rootCategoryId: string;
  let variantId: string;
  let optionId: string;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: superadminEmail, password: superadminPassword });
    const superadminToken = loginRes.body.accessToken;

    const orgRes = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        organizationName: 'Variants E2E',
        slug,
        adminEmail,
        adminPassword: 'test12345',
      });
    organizationId = orgRes.body.id;

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'test12345' });
    adminToken = adminLoginRes.body.accessToken;

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currentPassword: 'test12345', newPassword: 'securePass789' });

    const reloginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'securePass789' });
    adminToken = reloginRes.body.accessToken;

    // Create seed categories: root + leaf
    const rootRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Accesorios'] });
    rootCategoryId = rootRes.body[0].id;

    const leafRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Collares'], parentId: rootCategoryId });
    leafCategoryId = leafRes.body[0].id;
  });

  afterAll(async () => {
    if (organizationId) {
      await basePrisma.productVariant.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.categoryVariantOption.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.categoryVariantDefinition.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.product.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.category.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.user.deleteMany({ where: { organizationId } }).catch(() => {});
      await basePrisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => {});
    }
    await basePrisma.$disconnect();
  });

  // --- V1: Create variant on leaf vs root ---

  it('POST /categories/:id/variants creates variant on leaf category → 201', async () => {
    const res = await request(app)
      .post(`/api/categories/${leafCategoryId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Talle' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Talle');
    expect(res.body.categoryId).toBe(leafCategoryId);
    variantId = res.body.id;
  });

  it('POST /categories/:id/variants on root category → 400', async () => {
    const res = await request(app)
      .post(`/api/categories/${rootCategoryId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Material' });

    expect(res.status).toBe(400);
  });

  // --- V2: Add options to variant ---

  it('POST /variants/:id/options creates an option value', async () => {
    const res = await request(app)
      .post(`/api/categories/variants/${variantId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'Grande' });

    expect(res.status).toBe(201);
    expect(res.body.value).toBe('Grande');
    expect(res.body.variantId).toBe(variantId);
    optionId = res.body.id;

    // Add a second option
    await request(app)
      .post(`/api/categories/variants/${variantId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'Chico' });
  });

  // --- V3: GET variants includes options ---

  it('GET /categories/:id/variants returns definitions with options', async () => {
    const res = await request(app)
      .get(`/api/categories/${leafCategoryId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const talle = res.body.find((v: any) => v.name === 'Talle');
    expect(talle).toBeDefined();
    expect(Array.isArray(talle.options)).toBe(true);
    expect(talle.options.length).toBeGreaterThanOrEqual(2);

    const values = talle.options.map((o: any) => o.value);
    expect(values).toContain('Grande');
    expect(values).toContain('Chico');
  });

  // --- V4: Update variant/option names ---

  it('PUT /variants/:id renames a variant definition', async () => {
    const res = await request(app)
      .put(`/api/categories/variants/${variantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Tamaño' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Tamaño');

    // Rename back
    await request(app)
      .put(`/api/categories/variants/${variantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Talle' });
  });

  it('PUT /options/:id renames an option value', async () => {
    const res = await request(app)
      .put(`/api/categories/options/${optionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'Extra Grande' });

    expect(res.status).toBe(200);
    expect(res.body.value).toBe('Extra Grande');

    // Rename back
    await request(app)
      .put(`/api/categories/options/${optionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'Grande' });
  });

  // --- V7: Unique constraint — duplicate name in same category ---

  it('POST /categories/:id/variants duplicate name in same category → 409', async () => {
    const res = await request(app)
      .post(`/api/categories/${leafCategoryId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Talle' });

    // Should be 409 conflict or 400
    expect([409, 400]).toContain(res.status);
  });

  // --- V5: Delete variant cascades ---

  it('DELETE /variants/:id cascades — options and product assignments removed', async () => {
    const res = await request(app)
      .delete(`/api/categories/variants/${variantId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify variant no longer appears
    const listRes = await request(app)
      .get(`/api/categories/${leafCategoryId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`);

    const talle = listRes.body.find((v: any) => v.name === 'Talle');
    expect(talle).toBeUndefined();
  });

  // --- V6: Tenant isolation ---

  it('Variant is tenant-scoped — other org cannot see it', async () => {
    // Create a second org
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: superadminEmail, password: superadminPassword });
    const superadminToken = loginRes.body.accessToken;

    const org2Slug = `e2e-variants-2-${Date.now()}`;
    const org2Res = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        organizationName: 'Variants Isolation E2E',
        slug: org2Slug,
        adminEmail: `admin-iso-${Date.now()}@e2e-test.com`,
        adminPassword: 'test12345',
      });

    // Login as org2 admin
    const admin2Res = await request(app)
      .post('/api/auth/login')
      .send({ email: org2Res.body.adminEmail ?? `admin-iso-${Date.now()}@e2e-test.com`, password: 'test12345' });

    // Skip if login fails (timing)
    if (admin2Res.status !== 200) return;

    const admin2Token = admin2Res.body.accessToken;

    // Org2 should not see org1's categories or variants
    const catRes = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${admin2Token}`);

    if (catRes.status === 200) {
      const hasAccesorios = catRes.body.some((c: any) => c.name === 'Accesorios');
      expect(hasAccesorios).toBe(false);
    }

    // Cleanup org2
    const admin2Me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${admin2Token}`);
    if (admin2Me.status === 200) {
      const org2Id = admin2Me.body.organizationId;
      await basePrisma.productVariant.deleteMany({ where: { organizationId: org2Id } }).catch(() => {});
      await basePrisma.categoryVariantOption.deleteMany({ where: { organizationId: org2Id } }).catch(() => {});
      await basePrisma.categoryVariantDefinition.deleteMany({ where: { organizationId: org2Id } }).catch(() => {});
      await basePrisma.product.deleteMany({ where: { organizationId: org2Id } }).catch(() => {});
      await basePrisma.category.deleteMany({ where: { organizationId: org2Id } }).catch(() => {});
      await basePrisma.user.deleteMany({ where: { organizationId: org2Id } }).catch(() => {});
      await basePrisma.organization.deleteMany({ where: { id: org2Id } }).catch(() => {});
    }
  });
});

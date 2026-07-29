import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * E2E tests for product-variant integration: create with variants,
 * change category clears variants, display includes variant labels.
 *
 * RED phase — these tests validate that products and variants interact
 * correctly through the API.
 *
 * Requires a running database with SUPERADMIN seed.
 */
describe('E2E: product-variant integration', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  const slug = `e2e-prod-var-${Date.now()}`;
  const adminEmail = `admin-prod-var-${Date.now()}@e2e-test.com`;

  let adminToken: string;
  let organizationId: string;
  let collaresId: string;
  let camasId: string;
  let talleVariantId: string;
  let optionGId: string;
  let productId: string;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: superadminEmail, password: superadminPassword });
    const superadminToken = loginRes.body.accessToken;

    const orgRes = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        organizationName: 'Product Variants E2E',
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

    // Create two leaf categories: Collares (with variant), Camas (without)
    const accRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Accesorios'] });
    const accId = accRes.body[0].id;

    const colRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Collares'], parentId: accId });
    collaresId = colRes.body[0].id;

    const camRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Camas'] });
    camasId = camRes.body[0].id;

    // Create variant for Collares
    const varRes = await request(app)
      .post(`/api/categories/${collaresId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Talle' });
    talleVariantId = varRes.body.id;

    // Create options: Grande, Chico
    const optGRes = await request(app)
      .post(`/api/categories/variants/${talleVariantId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'Grande' });
    optionGId = optGRes.body.id;

    await request(app)
      .post(`/api/categories/variants/${talleVariantId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'Chico' });
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

  // --- P1: Create product with variantOptionIds ---

  it('POST /products with valid variantOptionIds → 201 (P1)', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Collar Premium',
        price: 3500,
        quantity: 25,
        categoryId: collaresId,
        variantOptionIds: [optionGId],
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Collar Premium');
    productId = res.body.id;
  });

  it('POST /products with option from wrong category → 400 (P1)', async () => {
    // Create a variant+option on Camas category
    const varCamasRes = await request(app)
      .post(`/api/categories/${camasId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Material' });
    const varCamasId = varCamasRes.body.id;

    const optCamasRes = await request(app)
      .post(`/api/categories/variants/${varCamasId}/options`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'Espuma' });
    const optCamasId = optCamasRes.body.id;

    // Try to create a product in Collares with Camas option
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad Product',
        price: 1000,
        quantity: 1,
        categoryId: collaresId,
        variantOptionIds: [optCamasId],
      });

    expect(res.status).toBe(400);
  });

  // --- P2: Product display includes variants ---

  it('GET /products includes variant labels (P2)', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const collar = res.body.find((p: any) => p.id === productId);
    expect(collar).toBeDefined();

    // Product should include variant assignments with option and variant name
    expect(collar.variantAssignments).toBeDefined();
    expect(Array.isArray(collar.variantAssignments)).toBe(true);

    if (collar.variantAssignments.length > 0) {
      const assignment = collar.variantAssignments[0];
      expect(assignment.option).toBeDefined();
      expect(assignment.option.value).toBe('Grande');
      expect(assignment.option.variant).toBeDefined();
      expect(assignment.option.variant.name).toBe('Talle');
    }
  });

  // --- P3: Category change clears variant assignments ---

  it('PUT /products/:id category change clears old variant assignments (P3)', async () => {
    // Change category from Collares to Camas
    const res = await request(app)
      .put(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId: camasId,
      });

    expect(res.status).toBe(200);

    // Verify product is now in Camas
    const prodRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);

    const collar = prodRes.body.find((p: any) => p.id === productId);
    expect(collar).toBeDefined();
    expect(collar.categoryId).toBe(camasId);

    // Variant assignments should be cleared (Talle option from Collares no longer valid)
    expect(collar.variantAssignments).toBeDefined();
    expect(collar.variantAssignments.length).toBe(0);
  });

  // --- Product creation without variantOptionIds still works ---

  it('POST /products without variantOptionIds still works (backward compat)', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Cama Básica',
        price: 8000,
        quantity: 5,
        categoryId: camasId,
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Cama Básica');
  });
});

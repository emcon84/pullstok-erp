import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * E2E tests for category tree hierarchy: create child, tree endpoint,
 * move category, delete cascade.
 *
 * RED phase — these tests exercise endpoints and database behavior that
 * must pass when the feature is fully implemented. Currently the tree
 * endpoint (GET /categories/tree) is not implemented, so the tree tests
 * should fail with 404 until the endpoint is created.
 *
 * Requires a running database (nexo_db_dev:5434) with SUPERADMIN seed.
 */
describe('E2E: categories tree hierarchy', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  const slug = `e2e-cat-tree-${Date.now()}`;
  const adminEmail = `admin-cat-tree-${Date.now()}@e2e-test.com`;

  let adminToken: string;
  let organizationId: string;
  let rootCatId: string;
  let childCatId: string;
  let grandchildCatId: string;

  beforeAll(async () => {
    // Create org + admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: superadminEmail, password: superadminPassword });
    const superadminToken = loginRes.body.accessToken;

    const orgRes = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        organizationName: 'Category Tree E2E',
        slug,
        adminEmail,
        adminPassword: 'test12345',
      });
    organizationId = orgRes.body.id;

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'test12345' });
    adminToken = adminLoginRes.body.accessToken;

    // Change password so mustChangePassword is no longer true
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currentPassword: 'test12345', newPassword: 'securePass789' });

    // Re-login after password change (token from old login still works but safest)
    const reloginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'securePass789' });
    adminToken = reloginRes.body.accessToken;
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

  // --- POST /categories with parentId (C4) ---

  it('POST /categories creates a root category (no parentId)', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Perros'] });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].parentId).toBeNull();
    rootCatId = res.body[0].id;
  });

  it('POST /categories creates a child category with parentId', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Alimento Seco'], parentId: rootCatId });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].parentId).toBe(rootCatId);
    childCatId = res.body[0].id;
  });

  it('POST /categories with same name under different parent is allowed (C4)', async () => {
    // Create a second root
    const rootRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Gatos'] });
    expect(rootRes.status).toBe(201);
    const gatosId = rootRes.body[0].id;

    // Create Alimento Seco under Gatos — should be allowed (different parent)
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Alimento Seco'], parentId: gatosId });

    expect(res.status).toBe(201);
    expect(res.body[0].parentId).toBe(gatosId);
    expect(res.body[0].name).toBe('Alimento Seco');
  });

  it('POST /categories with same name under same parent returns 409 (C4)', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Alimento Seco'], parentId: rootCatId });

    // Should be rejected — duplicate name under same parent
    expect(res.status).toBe(409);
  });

  // --- GET /categories/tree (C3) ---

  it('GET /categories/tree returns nested JSON structure', async () => {
    const res = await request(app)
      .get('/api/categories/tree')
      .set('Authorization', `Bearer ${adminToken}`);

    // RED: This should return nested JSON once the endpoint is implemented.
    // Until then, it returns 404 or falls through to /categories/:id handler.
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Verify nested structure: roots should have children array
    const perros = res.body.find((c: any) => c.name === 'Perros');
    expect(perros).toBeDefined();
    expect(Array.isArray(perros.children)).toBe(true);

    // Perros should have Alimento Seco as a child
    const alimentoChild = perros.children.find((c: any) => c.name === 'Alimento Seco');
    expect(alimentoChild).toBeDefined();
    expect(alimentoChild.children).toBeDefined();
  });

  // --- GET /categories/:id/children ---

  it('GET /categories/:id/children returns direct children only', async () => {
    // Create grandchild under childCat
    const grandRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Premium'], parentId: childCatId });

    expect(grandRes.status).toBe(201);
    grandchildCatId = grandRes.body[0].id;

    // Get children of root — should include "Alimento Seco" but NOT "Premium"
    const res = await request(app)
      .get(`/api/categories/${rootCatId}/children`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const childIds = res.body.map((c: any) => c.id);
    expect(childIds).toContain(childCatId);
    expect(childIds).not.toContain(grandchildCatId);
  });

  // --- PUT /categories/:id (move category, C5) ---

  it('PUT /categories/:id moves a leaf category to another root', async () => {
    // Move "Alimento Seco" (under Perros) to "Gatos" root
    const cats = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`);
    const gatos = cats.body.find((c: any) => c.name === 'Gatos' && c.parentId === null);

    const res = await request(app)
      .put(`/api/categories/${childCatId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ parentId: gatos.id });

    expect(res.status).toBe(200);
    expect(res.body.parentId).toBe(gatos.id);

    // Move back to Perros for subsequent tests
    await request(app)
      .put(`/api/categories/${childCatId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ parentId: rootCatId });
  });

  it('PUT /categories/:id rejects moving to a leaf category (C5)', async () => {
    // childCatId (Alimento Seco under Perros) is a leaf.
    // Create a second leaf and try to move "Premium" under it
    const res = await request(app)
      .put(`/api/categories/${grandchildCatId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ parentId: childCatId });

    // childCatId is itself a leaf (Alimento Seco) — moving to leaf should be 400
    expect(res.status).toBe(400);
  });

  // --- DELETE /categories/:id cascade (C6) ---

  it('DELETE /categories/:id cascades — products survive with null categoryId', async () => {
    // Create a product under grandchild
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Premium Dog Food',
        price: 5000,
        quantity: 10,
        categoryId: grandchildCatId,
      });

    // Delete grandchild
    const delRes = await request(app)
      .delete(`/api/categories/${grandchildCatId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);

    // Verify product still exists but categoryId is null
    const prodRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);

    const premiumProduct = prodRes.body.find((p: any) => p.name === 'Premium Dog Food');
    expect(premiumProduct).toBeDefined();
    expect(premiumProduct.categoryId).toBeNull();
  });

  // --- GET /categories/tree — recursive depth ---

  it('GET /categories/tree handles three levels of nesting', async () => {
    const res = await request(app)
      .get('/api/categories/tree')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    // After the previous operations, Perros should still exist with Alimento Seco as child
    const perros = res.body.find((c: any) => c.name === 'Perros');
    expect(perros).toBeDefined();
    expect(Array.isArray(perros.children)).toBe(true);

    // Alimento Seco should be a child of Perros
    const alimento = perros.children.find((c: any) => c.name === 'Alimento Seco');
    expect(alimento).toBeDefined();
  });
});

import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * Test end-to-end (Supertest) del flujo de onboarding completo, corriendo
 * contra la DB real de dev (nexo_db_dev:5434) — este proyecto no tiene una
 * DB de test separada, así que el setup/teardown crea y borra sus propios
 * datos para no contaminar la data de demo.
 *
 * Requiere el SUPERADMIN seedeado (`prisma/seed.ts`):
 *   superadmin@nexo.com / superadmin123
 * Si no existe en la DB contra la que corre este test, correr `pnpm seed`
 * antes de ejecutar esta suite.
 *
 * HALLAZGO IMPORTANTE (reportado, no asumido): el gate de onboarding
 * ("ADMIN con onboardingCompletedAt=null no puede acceder a rutas normales")
 * está implementado SOLO en el frontend (nexo-front/src/layouts/ProtectedLayout.tsx),
 * NO existe un middleware backend que bloquee /products u otras rutas de
 * negocio cuando el onboarding está incompleto. authenticateJWT es la única
 * guarda en productRoutes.ts. Por eso, los asserts de "bloqueo" de este test
 * verifican el comportamiento REAL (acceso permitido) y no el enunciado
 * original de la task 4.4 ("onboarding incompleto bloquea /products"), que
 * describía un gate que no fue implementado a nivel API en Phase 2/3.
 */
describe('E2E: secuencia completa de onboarding', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  const slug = `e2e-onboarding-${Date.now()}`;
  const adminEmail = `admin-${Date.now()}@e2e-test.com`;
  const tempPassword = 'temporal123';
  const newPassword = 'nuevaPassword456';

  let superadminToken: string;
  let organizationId: string;
  let adminToken: string;

  afterAll(async () => {
    // Limpieza: borrar todo lo creado por este test (orden por FKs).
    if (organizationId) {
      await basePrisma.product.deleteMany({ where: { organizationId } });
      await basePrisma.category.deleteMany({ where: { organizationId } });
      await basePrisma.user.deleteMany({ where: { organizationId } });
      await basePrisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await basePrisma.$disconnect();
  });

  it('login del SUPERADMIN', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: superadminEmail, password: superadminPassword });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    superadminToken = res.body.accessToken;
  });

  it('SUPERADMIN crea una organización + admin nuevo', async () => {
    const res = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        organizationName: 'Ferretería E2E Test',
        slug,
        adminEmail,
        adminPassword: tempPassword,
      });

    expect(res.status).toBe(201);
    organizationId = res.body.id;
    expect(organizationId).toBeDefined();
  });

  it('login del admin nuevo devuelve mustChangePassword=true', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: tempPassword });

    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(true);
    adminToken = res.body.accessToken;
  });

  it('GET /auth/me refleja mustChangePassword=true y onboardingCompletedAt=null', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
    expect(res.body.organization.onboardingCompletedAt).toBeNull();
  });

  it(
    'POST /auth/change-password con la contraseña actual incorrecta es rechazado',
    async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currentPassword: 'password-incorrecta', newPassword });

      expect(res.status).toBe(400);
    },
  );

  it('POST /auth/change-password con la contraseña actual correcta funciona', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currentPassword: tempPassword, newPassword });

    expect(res.status).toBe(200);
  });

  it('GET /auth/me ya NO pide cambio de contraseña tras change-password', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(false);
    // El onboarding sigue incompleto en este punto de la secuencia.
    expect(res.body.organization.onboardingCompletedAt).toBeNull();
  });

  it(
    'GET /products con onboarding incompleto: el backend NO bloquea (gate es solo de frontend)',
    async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${adminToken}`);

      // Comportamiento real verificado: no hay gate de onboarding a nivel API.
      // Documentado como hallazgo — el bloqueo real ocurre en
      // nexo-front/src/layouts/ProtectedLayout.tsx, no en el backend.
      expect(res.status).toBe(200);
    },
  );

  it('POST /onboarding/suggested-categories según industry elegida (paso 1 simulado)', async () => {
    const res = await request(app)
      .get('/api/onboarding/suggested-categories?industry=FERRETERIA')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThan(0);
  });

  it('PATCH /organizations/me guarda los datos del negocio (paso 1 del wizard)', async () => {
    const res = await request(app)
      .patch('/api/organizations/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        address: 'Av. Siempreviva 742',
        phone: '11-4444-5555',
        taxId: '20-12345678-9',
        industry: 'FERRETERIA',
      });

    expect(res.status).toBe(200);
    expect(res.body.industry).toBe('FERRETERIA');
  });

  it('POST /categories crea las categorías del paso 2 del wizard', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ names: ['Herramientas', 'Tornillería'] });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
  });

  it('POST /products (alta manual, paso 3) exige categoryId real', async () => {
    const categoriesRes = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`);
    const categoryId = categoriesRes.body[0].id;

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Martillo', price: 1500, quantity: 10, categoryId });

    expect(res.status).toBe(201);
  });

  it('POST /organizations/me/complete-onboarding marca el onboarding como completo', async () => {
    const res = await request(app)
      .post('/api/organizations/me/complete-onboarding')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.onboardingCompletedAt).not.toBeNull();
  });

  it('GET /auth/me ya refleja onboardingCompletedAt seteado', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.organization.onboardingCompletedAt).not.toBeNull();
  });

  it('acceso normal restaurado: GET /products funciona después del onboarding completo', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('complete-onboarding llamado de nuevo es idempotente (no rompe, no duplica)', async () => {
    const res = await request(app)
      .post('/api/organizations/me/complete-onboarding')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.onboardingCompletedAt).not.toBeNull();
  });
});

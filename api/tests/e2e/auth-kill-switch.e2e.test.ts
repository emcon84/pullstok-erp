import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * Test end-to-end (Supertest) del kill switch de organización suspendida en
 * login/refresh — corre contra la DB real de dev (nexo_db_dev:5434), mismo
 * patrón que tests/e2e/onboarding.e2e.test.ts.
 *
 * Bug que este test cubre (ver design de planes-y-billing, Fase 4):
 * AuthService.login/refresh solo validaban user.isActive y NUNCA leían
 * organization.isActive, así que un usuario de una organización suspendida
 * por el superadmin se seguía logueando sin restricción.
 *
 * Requiere el SUPERADMIN seedeado (`prisma/seed.ts`):
 *   superadmin@nexo.com / superadmin123
 * Si no existe en la DB contra la que corre este test, correr `pnpm seed`
 * antes de ejecutar esta suite.
 */
describe('E2E: kill switch de organización suspendida en login/refresh', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  const slug = `e2e-killswitch-${Date.now()}`;
  const adminEmail = `admin-killswitch-${Date.now()}@e2e-test.com`;
  const adminPassword = 'temporal123';

  let superadminToken: string;
  let organizationId: string;

  afterAll(async () => {
    if (organizationId) {
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

  it('SUPERADMIN crea una organización + admin nuevo (org activa por defecto)', async () => {
    const res = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        organizationName: 'Ferretería Kill Switch E2E',
        slug,
        adminEmail,
        adminPassword,
      });

    expect(res.status).toBe(201);
    organizationId = res.body.id;
    expect(organizationId).toBeDefined();
  });

  let adminAccessToken: string;
  let adminRefreshToken: string;

  it('(a) login de usuario de org ACTIVA funciona normalmente', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    adminAccessToken = res.body.accessToken;
    adminRefreshToken = res.body.refreshToken;
  });

  it('refresh de usuario de org ACTIVA funciona normalmente', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: adminRefreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('SUPERADMIN suspende la organización', async () => {
    const res = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/active`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
  });

  it('(b) login de usuario de org SUSPENDIDA es rechazado (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/suspendida/i);
  });

  it('refresh de usuario de org SUSPENDIDA es rechazado (401)', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: adminRefreshToken });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/suspendida/i);
  });

  it('(c) SUPERADMIN (organizationId null) sigue pudiendo loguearse con la org suspendida en juego', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: superadminEmail, password: superadminPassword });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.organizationId).toBeNull();
  });

  it('reactivada la organización, el login vuelve a funcionar', async () => {
    const reactivate = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/active`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ isActive: true });
    expect(reactivate.status).toBe(200);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });
});

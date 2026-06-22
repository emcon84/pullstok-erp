import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * Test end-to-end (Supertest) de los endpoints de billing manual del panel
 * superadmin (Fase 3 de planes-y-billing), corriendo contra la DB real de
 * dev (nexo_db_dev:5434) — mismo patrón que tests/e2e/onboarding.e2e.test.ts.
 *
 * Requiere el SUPERADMIN seedeado (`prisma/seed.ts`):
 *   superadmin@nexo.com / superadmin123
 */
describe('E2E: billing manual de superadmin (plan + pago)', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  const slug = `e2e-billing-${Date.now()}`;
  const adminEmail = `admin-billing-${Date.now()}@e2e-test.com`;
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

  it('crea una organización SIN plan explícito y default a BASICO', async () => {
    const res = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        organizationName: 'Comercio E2E Billing',
        slug,
        adminEmail,
        adminPassword,
      });

    expect(res.status).toBe(201);
    expect(res.body.plan).toBe('BASICO');
    organizationId = res.body.id;
    expect(organizationId).toBeDefined();
  });

  it('crea una segunda organización CON plan explícito (PREMIUM)', async () => {
    const slug2 = `${slug}-premium`;
    const adminEmail2 = `admin-${adminEmail}`;

    const res = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        organizationName: 'Comercio E2E Billing Premium',
        slug: slug2,
        adminEmail: adminEmail2,
        adminPassword,
        plan: 'PREMIUM',
      });

    expect(res.status).toBe(201);
    expect(res.body.plan).toBe('PREMIUM');

    // Limpieza inmediata: esta org es solo para este caso puntual, no se
    // reusa en el resto de la suite.
    await basePrisma.user.deleteMany({ where: { organizationId: res.body.id } });
    await basePrisma.organization.deleteMany({ where: { id: res.body.id } });
  });

  it('GET /superadmin/organizations incluye plan y paidUntil', async () => {
    const res = await request(app)
      .get('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(res.status).toBe(200);
    const org = res.body.find((o: any) => o.id === organizationId);
    expect(org).toBeDefined();
    expect(org.plan).toBe('BASICO');
    expect(org.paidUntil).toBeNull();
    expect(org.isPaymentOverdue).toBe(true);
  });

  it('PATCH /organizations/:id/plan cambia el plan (upgrade BASICO -> PRO)', async () => {
    const res = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/plan`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ plan: 'PRO' });

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('PRO');
  });

  it('PATCH /organizations/:id/plan rechaza un valor de plan inválido', async () => {
    const res = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/plan`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ plan: 'ENTERPRISE' });

    expect(res.status).toBe(400);
  });

  it('PATCH /organizations/:id/plan permite downgrade (PRO -> BASICO)', async () => {
    const res = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/plan`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ plan: 'BASICO' });

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('BASICO');
  });

  it('PATCH /organizations/:id/billing registra un pago: paidUntil = ahora + 1 mes', async () => {
    const before = new Date();

    const res = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/billing`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ action: 'pay' });

    expect(res.status).toBe(200);
    expect(res.body.paidUntil).not.toBeNull();

    const paidUntil = new Date(res.body.paidUntil);
    const expected = new Date(before);
    expected.setMonth(expected.getMonth() + 1);

    // Tolerancia de unos segundos por el tiempo real de ejecución del test.
    expect(Math.abs(paidUntil.getTime() - expected.getTime())).toBeLessThan(5000);
  });

  it('PATCH /organizations/:id/billing registrado de nuevo NO acumula (siempre now()+1mes)', async () => {
    const firstRes = await request(app)
      .get('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`);
    const orgBefore = firstRes.body.find((o: any) => o.id === organizationId);
    const paidUntilBefore = new Date(orgBefore.paidUntil);

    const before = new Date();
    const res = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/billing`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ action: 'pay' });

    expect(res.status).toBe(200);
    const paidUntilAfter = new Date(res.body.paidUntil);
    const expected = new Date(before);
    expected.setMonth(expected.getMonth() + 1);

    // No se suma 1 mes al valor anterior (no acumula): el nuevo paidUntil
    // está cerca de now()+1mes, NO de paidUntilBefore+1mes.
    expect(Math.abs(paidUntilAfter.getTime() - expected.getTime())).toBeLessThan(5000);
    expect(paidUntilAfter.getTime()).not.toBe(
      paidUntilBefore.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
  });

  it('PATCH /organizations/:id/billing rechaza action distinto de "pay"', async () => {
    const res = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/billing`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ action: 'refund' });

    expect(res.status).toBe(400);
  });

  it('rutas de billing/plan rechazan acceso sin token (no SUPERADMIN)', async () => {
    const planRes = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/plan`)
      .send({ plan: 'PRO' });
    expect(planRes.status).toBe(401);

    const billingRes = await request(app)
      .patch(`/api/superadmin/organizations/${organizationId}/billing`)
      .send({ action: 'pay' });
    expect(billingRes.status).toBe(401);
  });
});

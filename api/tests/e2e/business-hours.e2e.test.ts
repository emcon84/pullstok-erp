import request from 'supertest';
import { toZonedTime } from 'date-fns-tz';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';
import { DaySetting } from '../../src/utils/businessHours';

/**
 * E2E del gate de horario comercial (design business-hours-access), vía
 * Supertest contra la DB real de dev — mismo patrón que
 * tests/e2e/auth-kill-switch.e2e.test.ts. Correr SOLO en el VPS (necesita la
 * DB y el SUPERADMIN seedeado: superadmin@nexo.com / superadmin123).
 *
 * Flujo que cubre (spec REQ-2 + REQ-3):
 *   1. ADMIN crea (create-on-read) y actualiza la config con PUT /api/business-hours.
 *   2. Con TODOS los días desactivados, un usuario operativo (VENDEDOR) que
 *      SÍ loguea (login NO está gateado) queda bloqueado con 403
 *      OUTSIDE_BUSINESS_HOURS en /api/products — sesión viva, backend 403.
 *   3. Habilitado el día de hoy 00:00-23:59, el mismo VENDEDOR vuelve a pasar.
 *   4. ADMIN nunca se bloquea (fast path de gestión, sin query).
 */
describe('E2E: gate de horario comercial (checkBusinessHours)', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  const slug = `e2e-bizhours-${Date.now()}`;
  const adminEmail = `admin-bizhours-${Date.now()}@e2e-test.com`;
  const adminPassword = 'temporal123';

  const TIMEZONE = 'America/Argentina/Buenos_Aires';

  let dbAvailable = true;

  /** 7 días, todos enabled en [open, close). */
  const daysForRange = (open: string, close: string): DaySetting[] =>
    Array.from({ length: 7 }, (_, day) => ({ day, enabled: true, open, close }));
  /** 7 días, todos disabled. */
  const allDisabled = (): DaySetting[] =>
    Array.from({ length: 7 }, (_, day) => ({
      day,
      enabled: false,
      open: '09:00',
      close: '19:00',
    }));

  let adminToken: string;
  let organizationId: string;
  let vendedorToken: string;
  let todayWeekday: number;

  // ── Guard: si la DB no responde, toda la suite hace SKIP ──
  beforeAll(async () => {
    try {
      await basePrisma.$queryRaw`SELECT 1`;
    } catch {
      console.warn('[SKIP] Dev DB no disponible — e2e business-hours omitido');
      dbAvailable = false;
      return;
    }

    // SUPERADMIN login (org se crea vía API de plataforma)
    const superadminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: superadminEmail, password: superadminPassword });
    expect(superadminLogin.status).toBe(200);
    const superadminToken = superadminLogin.body.accessToken as string;

    // Org + admin nuevo (org activa por defecto)
    const orgRes = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ organizationName: 'Business Hours E2E', slug, adminEmail, adminPassword });
    expect(orgRes.status).toBe(201);
    organizationId = orgRes.body.id;
    expect(organizationId).toBeDefined();

    // Login del admin de la nueva org
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.accessToken as string;

    // Weekday de hoy en la timezone de la org (contracto de resolveLocalTime)
    todayWeekday = toZonedTime(new Date(), TIMEZONE).getDay();
  });

  afterAll(async () => {
    if (organizationId) {
      await basePrisma.user.deleteMany({ where: { organizationId } });
      await basePrisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await basePrisma.$disconnect();
  });

  it('ADMIN: GET /api/business-hours devuelve defaults (create-on-read, sin fila propia)', async () => {
    const res = await request(app)
      .get('/api/business-hours')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe(TIMEZONE);
    expect(res.body.days).toHaveLength(7);
  });

  it('ADMIN: PUT con todos los días fuera persiste la config', async () => {
    const res = await request(app)
      .put('/api/business-hours')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ timezone: TIMEZONE, days: allDisabled() });
    expect(res.status).toBe(200);
    expect(res.body.days.every((d: DaySetting) => d.enabled === false)).toBe(true);
  });

  it('VENDEDOR se loguea (login NO está gateado) con la config fuera de horario', async () => {
    const vendedorEmail = `vendedor-bizhours-${Date.now()}@e2e-test.com`;
    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: vendedorEmail, password: 'password123', role: 'VENDEDOR' });
    expect(createRes.status).toBe(201);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: vendedorEmail, password: 'password123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe('VENDEDOR');
    vendedorToken = loginRes.body.accessToken as string;
  });

  it('VENDEDOR queda bloqueado (403 OUTSIDE_BUSINESS_HOURS) en GET /api/products', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('OUTSIDE_BUSINESS_HOURS');
  });

  it('ADMIN NO se bloquea aunque la config esté fuera de horario (fast path de gestión)', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).not.toBe(403);
  });

  it('ADMIN habilita el día de hoy 00:00-23:59 → el mismo VENDEDOR pasa', async () => {
    const days = daysForRange('00:00', '23:59').map((d) =>
      d.day === todayWeekday ? { ...d, enabled: true } : d,
    );
    const putRes = await request(app)
      .put('/api/business-hours')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ timezone: TIMEZONE, days });
    expect(putRes.status).toBe(200);

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(res.status).toBe(200);
  });
});
import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * Test end-to-end (Supertest) del módulo de Facturación de Servicios
 * (WS2 del change facturacion-servicios), corre contra la DB real de dev
 * (nexo_db_dev:5434), mismo patrón que tests/e2e/auth-kill-switch.e2e.test.ts.
 *
 * Requiere el SUPERADMIN seedeado (`prisma/seed.ts`):
 *   superadmin@nexo.com / superadmin123
 */
describe('E2E: Módulo de Facturación de Servicios', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  let superadminToken: string;
  const orgIdsToCleanup: string[] = [];

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: superadminEmail, password: superadminPassword });
    expect(res.status).toBe(200);
    superadminToken = res.body.accessToken;
  });

  afterAll(async () => {
    for (const organizationId of orgIdsToCleanup) {
      await basePrisma.invoiceItem.deleteMany({
        where: { invoice: { organizationId } },
      });
      await basePrisma.invoice.deleteMany({ where: { organizationId } });
      await basePrisma.customer.deleteMany({ where: { organizationId } });
      await basePrisma.counter.deleteMany({ where: { organizationId } });
      await basePrisma.user.deleteMany({ where: { organizationId } });
      await basePrisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await basePrisma.$disconnect();
  });

  /** Crea una org con el plan indicado + admin, devuelve { organizationId, token }. */
  const createOrgWithPlan = async (
    plan: 'BASICO' | 'PRO' | 'PREMIUM',
    label: string,
  ) => {
    const slug = `e2e-inv-${label}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const adminEmail = `admin-${label}-${Date.now()}@e2e-test.com`;
    const adminPassword = 'temporal123';

    const createRes = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        organizationName: `Org Facturación ${label}`,
        slug,
        adminEmail,
        adminPassword,
        plan,
      });
    expect(createRes.status).toBe(201);
    const organizationId = createRes.body.id;
    orgIdsToCleanup.push(organizationId);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    expect(loginRes.status).toBe(200);

    return { organizationId, token: loginRes.body.accessToken as string };
  };

  const createCustomer = async (token: string, name: string) => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, email: `${name.toLowerCase().replace(/\s+/g, '-')}@cliente-test.com` });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  describe('Gating por plan', () => {
    it('org BASICO recibe 403 INVOICING_NOT_AVAILABLE en cualquier endpoint de /invoices', async () => {
      const { token } = await createOrgWithPlan('BASICO', 'basico');

      const res = await request(app)
        .get('/api/invoices')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('INVOICING_NOT_AVAILABLE');
    });

    it('org PRO también recibe 403 (solo PREMIUM tiene facturación)', async () => {
      const { token } = await createOrgWithPlan('PRO', 'pro');

      const res = await request(app)
        .get('/api/invoices')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('INVOICING_NOT_AVAILABLE');
    });

    it('org PREMIUM puede acceder normalmente', async () => {
      const { token } = await createOrgWithPlan('PREMIUM', 'premium-gate');

      const res = await request(app)
        .get('/api/invoices')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('CRUD + numeración correlativa sin huecos', () => {
    it('crea DRAFT, emite con number correlativo FAC-0001/0002, sin huecos', async () => {
      const { token } = await createOrgWithPlan('PREMIUM', 'crud');
      const customerId = await createCustomer(token, 'Cliente Crud');

      const create1 = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          items: [
            { description: 'Servicio 1', quantity: 2, unitPrice: 100, taxRate: 21 },
          ],
        });
      expect(create1.status).toBe(201);
      expect(create1.body.status).toBe('DRAFT');
      expect(create1.body.number).toBeNull();
      expect(create1.body.subtotal).toBeCloseTo(200, 5);
      expect(create1.body.taxAmount).toBeCloseTo(42, 5);
      expect(create1.body.totalAmount).toBeCloseTo(242, 5);

      const issue1 = await request(app)
        .put(`/api/invoices/${create1.body.id}/issue`)
        .set('Authorization', `Bearer ${token}`);
      expect(issue1.status).toBe(200);
      expect(issue1.body.status).toBe('ISSUED');
      expect(issue1.body.number).toBe('FAC-0001');

      const create2 = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          items: [
            { description: 'Servicio 2', quantity: 1, unitPrice: 500, taxRate: 10.5 },
          ],
        });
      expect(create2.status).toBe(201);

      const issue2 = await request(app)
        .put(`/api/invoices/${create2.body.id}/issue`)
        .set('Authorization', `Bearer ${token}`);
      expect(issue2.status).toBe(200);
      expect(issue2.body.number).toBe('FAC-0002');
    });

    it('markAsPaid pasa paymentStatus a PAID solo si status=ISSUED', async () => {
      const { token } = await createOrgWithPlan('PREMIUM', 'pay');
      const customerId = await createCustomer(token, 'Cliente Pay');

      const draft = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          items: [{ description: 'Servicio', quantity: 1, unitPrice: 100, taxRate: 21 }],
        });

      const payOnDraft = await request(app)
        .put(`/api/invoices/${draft.body.id}/pay`)
        .set('Authorization', `Bearer ${token}`);
      expect(payOnDraft.status).toBe(400);

      const issued = await request(app)
        .put(`/api/invoices/${draft.body.id}/issue`)
        .set('Authorization', `Bearer ${token}`);
      expect(issued.status).toBe(200);

      const paid = await request(app)
        .put(`/api/invoices/${draft.body.id}/pay`)
        .set('Authorization', `Bearer ${token}`);
      expect(paid.status).toBe(200);
      expect(paid.body.paymentStatus).toBe('PAID');
    });

    it('cancelInvoice cancela una ISSUED y conserva el number', async () => {
      const { token } = await createOrgWithPlan('PREMIUM', 'cancel');
      const customerId = await createCustomer(token, 'Cliente Cancel');

      const draft = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          items: [{ description: 'Servicio', quantity: 1, unitPrice: 100, taxRate: 21 }],
        });
      const issued = await request(app)
        .put(`/api/invoices/${draft.body.id}/issue`)
        .set('Authorization', `Bearer ${token}`);
      const numberBeforeCancel = issued.body.number;

      const cancelled = await request(app)
        .put(`/api/invoices/${draft.body.id}/cancel`)
        .set('Authorization', `Bearer ${token}`);
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe('CANCELLED');
      expect(cancelled.body.number).toBe(numberBeforeCancel);
    });
  });

  describe('Aislamiento multi-tenant', () => {
    it('org A no ve ni puede acceder a facturas de org B', async () => {
      const orgA = await createOrgWithPlan('PREMIUM', 'tenant-a');
      const orgB = await createOrgWithPlan('PREMIUM', 'tenant-b');
      const customerA = await createCustomer(orgA.token, 'Cliente A');

      const invoiceA = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${orgA.token}`)
        .send({
          customerId: customerA,
          items: [{ description: 'Servicio A', quantity: 1, unitPrice: 100, taxRate: 21 }],
        });
      expect(invoiceA.status).toBe(201);

      // org B intenta leer la factura de org A por id directo.
      const getFromB = await request(app)
        .get(`/api/invoices/${invoiceA.body.id}`)
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(getFromB.status).toBe(404);

      // org B la lista — debe estar vacía (no ve la de A).
      const listFromB = await request(app)
        .get('/api/invoices')
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(listFromB.status).toBe(200);
      expect(listFromB.body.find((inv: any) => inv.id === invoiceA.body.id)).toBeUndefined();

      // org A sí la ve.
      const getFromA = await request(app)
        .get(`/api/invoices/${invoiceA.body.id}`)
        .set('Authorization', `Bearer ${orgA.token}`);
      expect(getFromA.status).toBe(200);
    });

    it('numeración independiente por org: ambas empiezan en FAC-0001', async () => {
      const orgA = await createOrgWithPlan('PREMIUM', 'seq-a');
      const orgB = await createOrgWithPlan('PREMIUM', 'seq-b');
      const customerA = await createCustomer(orgA.token, 'Cliente Seq A');
      const customerB = await createCustomer(orgB.token, 'Cliente Seq B');

      const draftA = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${orgA.token}`)
        .send({
          customerId: customerA,
          items: [{ description: 'X', quantity: 1, unitPrice: 10, taxRate: 21 }],
        });
      const issuedA = await request(app)
        .put(`/api/invoices/${draftA.body.id}/issue`)
        .set('Authorization', `Bearer ${orgA.token}`);
      expect(issuedA.body.number).toBe('FAC-0001');

      const draftB = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${orgB.token}`)
        .send({
          customerId: customerB,
          items: [{ description: 'Y', quantity: 1, unitPrice: 10, taxRate: 21 }],
        });
      const issuedB = await request(app)
        .put(`/api/invoices/${draftB.body.id}/issue`)
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(issuedB.body.number).toBe('FAC-0001');
    });
  });

  describe('Reglas de transición y borrado', () => {
    it('rechaza emitir un DRAFT sin líneas (400) — vía borrado de líneas previo a emitir no aplica, se valida en creación', async () => {
      const { token } = await createOrgWithPlan('PREMIUM', 'no-items');
      const customerId = await createCustomer(token, 'Cliente NoItems');

      // El schema exige items.min(1) en create, así que la única forma de
      // llegar a un DRAFT sin líneas es manipulando la DB directamente —
      // simulamos vía Prisma para probar la regla de negocio en issueInvoice.
      const draft = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          items: [{ description: 'Temp', quantity: 1, unitPrice: 1, taxRate: 21 }],
        });
      expect(draft.status).toBe(201);

      await basePrisma.invoiceItem.deleteMany({ where: { invoiceId: draft.body.id } });

      const issueEmpty = await request(app)
        .put(`/api/invoices/${draft.body.id}/issue`)
        .set('Authorization', `Bearer ${token}`);
      expect(issueEmpty.status).toBe(400);
    });

    it('bloquea editar una factura ISSUED (409)', async () => {
      const { token } = await createOrgWithPlan('PREMIUM', 'no-edit-issued');
      const customerId = await createCustomer(token, 'Cliente NoEdit');

      const draft = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          items: [{ description: 'Servicio', quantity: 1, unitPrice: 100, taxRate: 21 }],
        });
      await request(app)
        .put(`/api/invoices/${draft.body.id}/issue`)
        .set('Authorization', `Bearer ${token}`);

      const editAttempt = await request(app)
        .put(`/api/invoices/${draft.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ description: 'Cambiado', quantity: 2, unitPrice: 200, taxRate: 21 }],
        });
      expect(editAttempt.status).toBe(409);
    });

    it('bloquea re-emitir una factura ya ISSUED (404/400, no reasigna number)', async () => {
      const { token } = await createOrgWithPlan('PREMIUM', 'no-reissue');
      const customerId = await createCustomer(token, 'Cliente NoReissue');

      const draft = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          items: [{ description: 'Servicio', quantity: 1, unitPrice: 100, taxRate: 21 }],
        });
      const firstIssue = await request(app)
        .put(`/api/invoices/${draft.body.id}/issue`)
        .set('Authorization', `Bearer ${token}`);
      expect(firstIssue.status).toBe(200);

      const secondIssue = await request(app)
        .put(`/api/invoices/${draft.body.id}/issue`)
        .set('Authorization', `Bearer ${token}`);
      // El controller busca DRAFT explícitamente: una vez ISSUED, no matchea
      // y devuelve 404 (no encontrado en estado DRAFT) — no reasigna number.
      expect(secondIssue.status).toBe(404);
      expect(secondIssue.body.number).toBeUndefined();
    });

    it('solo DRAFT es borrable: bloquea borrar ISSUED (400)', async () => {
      const { token } = await createOrgWithPlan('PREMIUM', 'no-delete-issued');
      const customerId = await createCustomer(token, 'Cliente NoDelete');

      const draft = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          items: [{ description: 'Servicio', quantity: 1, unitPrice: 100, taxRate: 21 }],
        });
      await request(app)
        .put(`/api/invoices/${draft.body.id}/issue`)
        .set('Authorization', `Bearer ${token}`);

      const deleteAttempt = await request(app)
        .delete(`/api/invoices/${draft.body.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteAttempt.status).toBe(400);
    });

    it('un DRAFT sí se puede borrar', async () => {
      const { token } = await createOrgWithPlan('PREMIUM', 'delete-draft');
      const customerId = await createCustomer(token, 'Cliente DeleteDraft');

      const draft = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          items: [{ description: 'Servicio', quantity: 1, unitPrice: 100, taxRate: 21 }],
        });

      const deleteAttempt = await request(app)
        .delete(`/api/invoices/${draft.body.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteAttempt.status).toBe(200);

      const getAfterDelete = await request(app)
        .get(`/api/invoices/${draft.body.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getAfterDelete.status).toBe(404);
    });
  });
});

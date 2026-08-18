import fs from "node:fs";
import path from "node:path";
import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * E2E de facturación electrónica ARCA contra HOMOLOGACIÓN (spec 4/5/6).
 *
 * Este test NO corre en local sin DB ni sin certificado: requiere
 * ARCA_E2E_CERT_DIR (VPS) con los certs WSASS de una org + BD real. Si no hay
 * cert, TODO el suite se skipea (patrón de los e2e que corren solo en VPS).
 *
 * Flujo por caso:
 *   POST /api/invoices (DRAFT) → PUT /:id/issue (ISSUED interno FAC-XXXX)
 *   → PUT /:id/issue-fiscal (emitirFiscalmente → CAE)
 *   → PUT /:id/retry-fiscal (reintento mismo correlativo)
 */
describe('E2E: ARCA facturación electrónica homo', () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@nexo.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'superadmin123';

  // Certificados WSASS por org en el VPS: /var/www/pullstok/certs/{org}/…
  // `slug` identifica la carpeta de certs (por convención deploy.sh).
  const CERT_DIR = process.env.ARCA_E2E_CERT_DIR ?? '';
  const CERT_CRT = path.join(CERT_DIR, 'wswfev1-HOMOLOGACION.crt');
  const CERT_KEY = path.join(CERT_DIR, 'wswfev1-HOMOLOGACION.key');
  const hasCert = !!CERT_DIR && fs.existsSync(CERT_CRT) && fs.existsSync(CERT_KEY);

  // Sin cert → todo el suite se skipea (type-safe: describe vs describe.skip).
  const maybeDescribe = hasCert ? describe : describe.skip;

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
      await basePrisma.arcaSequence.deleteMany({ where: { organizationId } });
      await basePrisma.arcaSetting.deleteMany({ where: { organizationId } });
      await basePrisma.invoiceItem.deleteMany({
        where: { invoice: { organizationId } },
      });
      await basePrisma.invoice.deleteMany({ where: { organizationId } });
      await basePrisma.sale.deleteMany({ where: { organizationId } });
      await basePrisma.product.deleteMany({ where: { organizationId } });
      await basePrisma.category.deleteMany({ where: { organizationId } });
      await basePrisma.customer.deleteMany({ where: { organizationId } });
      await basePrisma.counter.deleteMany({ where: { organizationId } });
      await basePrisma.user.deleteMany({ where: { organizationId } });
      await basePrisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await basePrisma.$disconnect();
  });

  // TODO (sdd/arca-facturacion-electronica, fase 7.2): VERIFICAR contra homo
  // el catálogo de FEParamGetCondicionIvaReceptor (códigos 1/5/6 + fecha RG
  // 5616) y el mapeo del design (A→condIva 1, B→condIva 5) antes de pasar a
  // PRODUCCION. La fecha exacta de rechazo difiere según fuente (evento WSFE
  // Code 39: 01/06/2026 vs manual v4.5: 01/09/2026).

  const createOrgWithPlan = async (plan: 'BASICO' | 'PRO' | 'PREMIUM', label: string) => {
    const slug = `e2e-arca-${label}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const adminEmail = `admin-arca-${label}-${Date.now()}@e2e-test.com`;
    const adminPassword = 'temporal123';

    const createRes = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ organizationName: `Org Arca ${label}`, slug, adminEmail, adminPassword, plan });
    expect(createRes.status).toBe(201);
    const organizationId = createRes.body.id;
    orgIdsToCleanup.push(organizationId);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    expect(loginRes.status).toBe(200);

    return { organizationId, token: loginRes.body.accessToken as string };
  };

  /** Configura ArcaSetting de la org (PUT /api/arca-settings, rol ADMIN). */
  const configureArca = async (token: string, cuitEmisor: string, puntoVenta: number) => {
    const res = await request(app)
      .put('/api/arca-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cuitEmisor,
        puntoVenta,
        environment: 'HOMOLOGACION',
        certPath: CERT_CRT,
        keyPath: CERT_KEY,
        enabled: true,
      });
    expect(res.status).toBe(200);
    return res.body;
  };

  /** Crea un customer para la org (Factura A identificada). */
  const createCustomer = async (token: string, name: string, taxId: string) => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, taxId });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  /** Crea una Invoice DRAFT de servicios con customerId → Factura A (80). */
  const createInvoice = async (
    token: string,
    opts: { customerId?: string; amount?: number } = {},
  ) => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: opts.customerId,
        items: [
          { description: 'Servicio ARCA', quantity: 1, unitPrice: opts.amount ?? 100, taxRate: 21 },
        ],
      });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };

  /** Crea una categoría y devuelve su id (para el bridge Sale→Invoice). */
  const createCategory = async (token: string, name: string) => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ names: [name] });
    expect(res.status).toBe(201);
    return res.body[0].id as string;
  };

  /** Crea un producto y devuelve su id. */
  const createProduct = async (token: string, categoryId: string, name: string) => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, price: 100, quantity: 10, categoryId });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };

  /** Crea una venta y devuelve su id. */
  const createSale = async (token: string, productId: string) => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({ products: [{ productId, quantity: 1, price: 100 }] });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };

  /**
   * Crea una Invoice DRAFT vía el bridge de ventas POST /api/sales/:saleId/invoice
   * SIN customerId → Factura B (DocTipo 99 / DocNro 0). Es el único camino con
   * customerId opcional (spec 6.2); createInvoiceSchema exige customerId.
   */
  const createSaleInvoice = async (token: string) => {
    const categoryId = await createCategory(token, 'Cat ARCA B');
    const product = await createProduct(token, categoryId, 'Producto ARCA B');
    const sale = await createSale(token, product.id);
    const res = await request(app)
      .post(`/api/sales/${sale.id}/invoice`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    return res.body as { id: string };
  };

  const issueInternal = async (token: string, invoiceId: string) => {
    const res = await request(app)
      .put(`/api/invoices/${invoiceId}/issue`)
      .set('Authorization', `Bearer ${token}`);
    return res;
  };

  const issueFiscal = async (token: string, invoiceId: string) => {
    return request(app)
      .put(`/api/invoices/${invoiceId}/issue-fiscal`)
      .set('Authorization', `Bearer ${token}`);
  };

  const retryFiscal = async (token: string, invoiceId: string) => {
    return request(app)
      .put(`/api/invoices/${invoiceId}/retry-fiscal`)
      .set('Authorization', `Bearer ${token}`);
  };

  maybeDescribe('Factura B sin identificar (99/0)', () => {
    it('emite DRAFT→ISSUED→CAE con DocTipo 99 / DocNro 0', async () => {
      const { token } = await createOrgWithPlan('PRO', 'b');
      await configureArca(token, '30709706701', 2);

      const invoice = await createSaleInvoice(token); // sin customerId → B (99/0)
      const issueRes = await issueInternal(token, invoice.id);
      expect(issueRes.status).toBe(200);

      const fiscal = await issueFiscal(token, invoice.id);
      expect(fiscal.status).toBe(200);
      expect(fiscal.body.status).toBe('ISSUED');
      expect(fiscal.body.cae).toBeTruthy();
      expect(fiscal.body.docTipoReceptor).toBe(99);
      expect(fiscal.body.docNroReceptor).toBe('0');
      expect(fiscal.body.puntoVenta).toBe(2);
    });
  });

  maybeDescribe('Factura A con CUIT fixture (80)', () => {
    it('emite con DocTipo 80 / CUIT válido y queda ISSUED con CAE', async () => {
      const { token } = await createOrgWithPlan('PRO', 'a');
      await configureArca(token, '30709706701', 2);

      const customerId = await createCustomer(token, 'Cliente A', '30-70970670-1');
      const invoice = await createInvoice(token, { customerId });
      await issueInternal(token, invoice.id);

      const fiscal = await issueFiscal(token, invoice.id);
      expect(fiscal.status).toBe(200);
      expect(fiscal.body.status).toBe('ISSUED');
      expect(fiscal.body.docTipoReceptor).toBe(80);
      expect(fiscal.body.docNroReceptor).toBe('30709706701');
      expect(fiscal.body.cae).toBeTruthy();
    });

    it('reintento desde PENDING_CAE reutiliza el MISMO correlativo', async () => {
      const { token } = await createOrgWithPlan('PRO', 'retry');
      await configureArca(token, '30709706701', 2);

      const customerId = await createCustomer(token, 'Cliente Retry', '30-70970670-1');
      const invoice = await createInvoice(token, { customerId });
      await issueInternal(token, invoice.id);

      // Primer issue-fiscal obtiene el CAE y reserva cbteNro.
      const first = await issueFiscal(token, invoice.id);
      expect(first.status).toBe(200);
      expect(first.body.cae).toBeTruthy();
      const cbteNro = first.body.cbteNro;

      // Un segundo retry sobre una factura ya ISSUED con CAE → 409 (ya emitida).
      const second = await retryFiscal(token, invoice.id);
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('INVALID_INVOICE_STATE');
      // El correlativo no cambió (no se reservó uno nuevo).
      expect(cbteNro).toBeTruthy();
    });
  });
});

import request from 'supertest';
import app from '../../src/app';
import { basePrisma } from '../../src/config/db';

/**
 * Test end-to-end del endpoint bridge Sale→Invoice:
 *   POST /api/sales/:saleId/invoice
 *
 * Stack: authenticateJWT → checkSaleInvoicingEnabled (PRO|PREMIUM) →
 *        validate(createSaleInvoiceSchema) → createInvoiceFromSale.
 *
 * Corre contra la DB real de dev (nexo_db_dev:5434).
 * Requiere superadmin seedeado: superadmin@nexo.com / superadmin123.
 */
describe('E2E: Bridge Sale→Invoice (POST /api/sales/:saleId/invoice)', () => {
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
    // Cleanup en orden correcto por FK:
    // 1. InvoiceItem (FK → Invoice, cascade pero se borra explícito)
    // 2. Invoice     (tiene FK saleId → Sale; debe ir antes que Sale)
    // 3. Sale        (onDelete: Cascade → elimina SaleItems automáticamente)
    // 4. Product     (SaleItems ya borrados; Category lo referencia)
    // 5. Category    (Products ya borrados)
    // 6. Customer    (Invoices ya borradas)
    // 7. Counter     (secuencias de numeración)
    // 8. User
    // 9. Organization
    for (const organizationId of orgIdsToCleanup) {
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

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Crea una org con el plan indicado + admin. Devuelve { organizationId, token }. */
  const createOrgWithPlan = async (
    plan: 'BASICO' | 'PRO' | 'PREMIUM',
    label: string,
  ) => {
    const slug = `e2e-saleinv-${label}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const adminEmail = `admin-${label}-${Date.now()}@e2e-test.com`;
    const adminPassword = 'temporal123';

    const createRes = await request(app)
      .post('/api/superadmin/organizations')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        organizationName: `Org SaleInv ${label}`,
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

  /** Crea un customer para la org autenticada con el token dado. */
  const createCustomer = async (token: string, name: string) => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        email: `${name.toLowerCase().replace(/\s+/g, '-')}@cliente-test.com`,
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  /** Crea una categoría y devuelve su id. */
  const createCategory = async (token: string, name: string) => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ names: [name] });
    expect(res.status).toBe(201);
    // La respuesta es un array de categorías creadas; tomamos la primera.
    return res.body[0].id as string;
  };

  /** Crea un producto y devuelve { id, name, price }. */
  const createProduct = async (
    token: string,
    categoryId: string,
    opts: { name: string; price: number; quantity: number },
  ) => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...opts, categoryId });
    expect(res.status).toBe(201);
    return res.body as { id: string; name: string; price: number };
  };

  /**
   * Crea una venta. El body de POST /api/sales usa `products` (array).
   * El servicio verifica stock en DB y descuenta quantity.
   */
  const createSale = async (
    token: string,
    products: { productId: string; quantity: number; price: number }[],
  ) => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({ products });
    expect(res.status).toBe(201);
    return res.body as { id: string; items: any[]; totalAmount: number };
  };

  // ─── Casos de test ──────────────────────────────────────────────────────────

  describe('Happy path', () => {
    it('org PRO: crea Invoice DRAFT desde Sale con ítems mapeados y totales correctos', async () => {
      const { token } = await createOrgWithPlan('PRO', 'happy');
      const categoryId = await createCategory(token, 'Cat Happy');
      const product = await createProduct(token, categoryId, {
        name: 'Widget Pro',
        price: 150,
        quantity: 20,
      });
      const sale = await createSale(token, [
        { productId: product.id, quantity: 2, price: 150 },
      ]);
      const customerId = await createCustomer(token, 'Cliente Happy');

      const res = await request(app)
        .post(`/api/sales/${sale.id}/invoice`)
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId });

      expect(res.status).toBe(201);

      // Campos principales de la Invoice
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.saleId).toBe(sale.id);
      expect(res.body.customerId).toBe(customerId);
      expect(res.body.number).toBeNull(); // DRAFT no tiene número correlativo aún

      // Ítems mapeados desde SaleItem: description=SaleItem.name, taxRate=21 fijo
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items).toHaveLength(1);
      const [item] = res.body.items;
      expect(item.description).toBe('Widget Pro');
      expect(item.quantity).toBe(2);
      expect(item.unitPrice).toBeCloseTo(150, 5);
      expect(item.taxRate).toBeCloseTo(21, 5);

      // Totales: subtotal = 2 × 150 = 300; IVA 21% = 63; total = 363
      expect(res.body.subtotal).toBeCloseTo(300, 5);
      expect(res.body.taxAmount).toBeCloseTo(63, 5);
      expect(res.body.totalAmount).toBeCloseTo(363, 5);
    });
  });

  describe('Doble facturación', () => {
    it('facturar la misma venta dos veces devuelve 409 SALE_ALREADY_INVOICED', async () => {
      const { token } = await createOrgWithPlan('PRO', 'double');
      const categoryId = await createCategory(token, 'Cat Doble');
      const product = await createProduct(token, categoryId, {
        name: 'Producto Doble',
        price: 50,
        quantity: 10,
      });
      const sale = await createSale(token, [
        { productId: product.id, quantity: 1, price: 50 },
      ]);
      const customerId = await createCustomer(token, 'Cliente Doble');

      // Primera facturación → 201
      const first = await request(app)
        .post(`/api/sales/${sale.id}/invoice`)
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId });
      expect(first.status).toBe(201);

      // Segunda facturación de la misma venta → 409 SALE_ALREADY_INVOICED
      const second = await request(app)
        .post(`/api/sales/${sale.id}/invoice`)
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId });
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('SALE_ALREADY_INVOICED');
    });
  });

  describe('Gating por plan', () => {
    it('org BASICO recibe 403 INVOICING_NOT_AVAILABLE (gate dispara antes de tocar la DB)', async () => {
      const { token } = await createOrgWithPlan('BASICO', 'basico');

      // El gate checkSaleInvoicingEnabled rechaza sin llegar al controller;
      // se puede usar cualquier UUID como saleId — no se consulta la DB.
      const fakeId = '00000000-0000-0000-0000-000000000001';
      const res = await request(app)
        .post(`/api/sales/${fakeId}/invoice`)
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId: fakeId });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('INVOICING_NOT_AVAILABLE');
    });

    it('org PREMIUM también puede facturar ventas (PRO + PREMIUM habilitados)', async () => {
      const { token } = await createOrgWithPlan('PREMIUM', 'premium-gate');
      const categoryId = await createCategory(token, 'Cat Premium');
      const product = await createProduct(token, categoryId, {
        name: 'Artículo Premium',
        price: 200,
        quantity: 5,
      });
      const sale = await createSale(token, [
        { productId: product.id, quantity: 1, price: 200 },
      ]);
      const customerId = await createCustomer(token, 'Cliente Premium');

      const res = await request(app)
        .post(`/api/sales/${sale.id}/invoice`)
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('DRAFT');
    });
  });

  describe('Aislamiento multi-tenant', () => {
    it('org B no puede facturar una venta de org A → 404; ninguna Invoice cross-tenant creada', async () => {
      const orgA = await createOrgWithPlan('PREMIUM', 'tenant-a');
      const orgB = await createOrgWithPlan('PREMIUM', 'tenant-b');

      // Org A crea producto + venta
      const categoryId = await createCategory(orgA.token, 'Cat Tenant A');
      const productA = await createProduct(orgA.token, categoryId, {
        name: 'Prod Org A',
        price: 100,
        quantity: 5,
      });
      const saleA = await createSale(orgA.token, [
        { productId: productA.id, quantity: 1, price: 100 },
      ]);

      // Org B tiene su propio customer
      const customerB = await createCustomer(orgB.token, 'Cliente Org B');

      // Org B intenta facturar la venta de Org A usando el id de esa venta
      const res = await request(app)
        .post(`/api/sales/${saleA.id}/invoice`)
        .set('Authorization', `Bearer ${orgB.token}`)
        .send({ customerId: customerB });

      // El scope de tenant hace que Org B no encuentre la venta de Org A → 404
      expect(res.status).toBe(404);

      // Verificación directa en DB: ninguna Invoice fue creada para esa venta
      const invoiceForSale = await basePrisma.invoice.findFirst({
        where: { saleId: saleA.id },
      });
      expect(invoiceForSale).toBeNull();
    });
  });

  describe('Customer inválido', () => {
    it('customerId inexistente devuelve 404 con mensaje de customer', async () => {
      const { token } = await createOrgWithPlan('PRO', 'bad-customer');
      const categoryId = await createCategory(token, 'Cat BadCust');
      const product = await createProduct(token, categoryId, {
        name: 'Prod BadCust',
        price: 75,
        quantity: 10,
      });
      const sale = await createSale(token, [
        { productId: product.id, quantity: 2, price: 75 },
      ]);

      // UUID válido en formato pero que no existe en la DB
      const fakeCustomerId = '00000000-0000-0000-0000-000000000099';
      const res = await request(app)
        .post(`/api/sales/${sale.id}/invoice`)
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId: fakeCustomerId });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/customer/i);
    });
  });
});

import request from "supertest";
import path from "path";
import app from "../../src/app";
import { basePrisma } from "../../src/config/db";

/**
 * E2E: import de planillas de precios Alican (sdd/alican-wholesale-price-list).
 * SOLO corre en el VPS (requiere Postgres real con seed de SUPERADMIN).
 *
 * Flujo: org fresh → subida del fixture SECO REAL (multipart) → preview con
 * 138 filas (137 con precios + 1 fila error con "-") → apply con decisiones →
 * suggestedPrice persistido y product.price SIN cambio → re-import del mismo
 * período sin duplicados → GET detalle → 404 cross-org.
 *
 * pdf-parse (pdfjs ESM) necesita --experimental-vm-modules bajo jest:
 *   NODE_OPTIONS=--experimental-vm-modules pnpm jest tests/e2e/priceListImport.e2e.test.ts
 */
describe("E2E: importación de planillas Alican (SECO real)", () => {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@nexo.com";
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin123";

  const slug = `e2e-price-list-${Date.now()}`;
  const adminEmail = `admin-price-list-${Date.now()}@e2e-test.com`;

  let adminToken: string;
  let organizationId: string;
  let productId: string;
  let priceListId: string;

  let org2Token: string;
  let org2Id: string;

  const createOrgWithAdmin = async (
    label: string,
    slugSuffix: string,
    email: string,
  ): Promise<{ orgId: string; adminToken: string }> => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: superadminEmail, password: superadminPassword });
    const superadminToken = loginRes.body.accessToken;

    const orgRes = await request(app)
      .post("/api/superadmin/organizations")
      .set("Authorization", `Bearer ${superadminToken}`)
      .send({
        organizationName: label,
        slug: `${slugSuffix}-${Date.now()}`,
        adminEmail: email,
        adminPassword: "test12345",
      });
    const orgId = orgRes.body.id;

    const adminLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "test12345" });
    let token = adminLoginRes.body.accessToken;

    await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "test12345", newPassword: "securePass789" });

    const reloginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "securePass789" });
    token = reloginRes.body.accessToken;

    return { orgId, adminToken: token };
  };

  const fixturePath = path.join(
    __dirname,
    "../fixtures/pdfs/alican-seco-082026.pdf",
  );

  beforeAll(async () => {
    const { orgId, adminToken: token } = await createOrgWithAdmin(
      "Price List E2E",
      "e2e-price-list",
      adminEmail,
    );
    organizationId = orgId;
    adminToken = token;

    // Categoría obligatoria (createProductSchema exige categoryId). Fix round 2
    // (finding B): antes se creaba el producto sin categoría → 400 → productId
    // undefined → TODAS las filas "unmatched".
    const catRes = await request(app)
      .post("/api/categories/single")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "E2E Price List" });
    expect(catRes.status).toBe(201);
    const categoryId = catRes.body.id;
    expect(categoryId).toBeTruthy();

    // Producto del catálogo cuyo nombre matchea EXACTAMENTE la primera fila
    // del fixture tras normalización ("sieger puppy mini x 1kg").
    const pRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "SIEGER Puppy Mini x 1 Kg.",
        price: 9999,
        quantity: 10,
        categoryId,
      });
    expect(pRes.status).toBe(201);
    productId = pRes.body.id;
    expect(productId).toBeTruthy();

    // Segunda org para el 404 cross-org.
    const org2 = await createOrgWithAdmin(
      "Price List E2E Org2",
      "e2e-price-list-2",
      `admin-price-list-2-${Date.now()}@e2e-test.com`,
    );
    org2Id = org2.orgId;
    org2Token = org2.adminToken;
  });

  afterAll(async () => {
    const cleanOrg = async (orgId: string) => {
      if (!orgId) return;
      await basePrisma.priceListEntry.deleteMany({ where: { section: { priceList: { organizationId: orgId } } } }).catch(() => {});
      await basePrisma.priceListSection.deleteMany({ where: { priceList: { organizationId: orgId } } }).catch(() => {});
      await basePrisma.priceList.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await basePrisma.product.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    };
    await cleanOrg(organizationId);
    await cleanOrg(org2Id);
  });

  it("preview: sube el PDF SECO real y devuelve 138 filas (137 con precios + 1 error)", async () => {
    const res = await request(app)
      .post("/api/products/import-price-list?dryRun=true")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", fixturePath);

    expect(res.status).toBe(200);
    expect(res.body.layout).toBe("SECO");
    expect(res.body.period).toBe("2026-08-10");
    expect(res.body.total).toBe(138);
    const errores = res.body.rows.filter((r: any) => r.estado === "error");
    expect(errores).toHaveLength(1);
    expect(errores[0].nombre).toBe("GOOSTER Adultos Razas Pequeñas (C/P) x 15 Kg.");
    // La primera fila (matcheada) lleva el sugerido calculado con round2.
    const primera = res.body.rows[0];
    expect(primera).toMatchObject({
      nombre: "SIEGER Puppy Mini x 1 Kg.",
      precioSinIva: 8795,
      precioConIva: 10642,
      sugerido: 14190.04,
      estado: "matched",
    });
    expect(primera.productId).toBe(productId);
  });

  it("apply: persiste suggestedPrice y NO toca product.price", async () => {
    // Preview de nuevo para obtener el payload de decisiones del server.
    const previewRes = await request(app)
      .post("/api/products/import-price-list?dryRun=true")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", fixturePath);
    expect(previewRes.status).toBe(200);

    const rows = previewRes.body.rows;
    const decisions = rows.map((r: any) => ({
      position: r.position,
      accion: r.estado === "matched" || r.estado === "multi-match" ? "import" : "omit",
      productId: r.productId ?? undefined,
      nombre: r.nombre,
      marca: r.marca,
      linea: r.linea,
      sublinea: r.sublinea,
      unidadEmpaque: r.unidadEmpaque,
      precioSinIva: r.precioSinIva,
      precioConIva: r.precioConIva,
    }));

    const applyRes = await request(app)
      .post("/api/products/import-price-list/apply")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        layout: previewRes.body.layout,
        period: previewRes.body.period,
        sourceFilename: previewRes.body.sourceFilename,
        rows: decisions,
      });

    expect(applyRes.status).toBe(200);
    expect(applyRes.body).toMatchObject({
      imported: 1,
      omitted: 137,
      suggestedUpdated: 1,
    });
    priceListId = applyRes.body.priceListId;

    const product = await basePrisma.product.findFirst({ where: { id: productId } });
    expect(Number(product?.suggestedPrice)).toBe(14190.04);
    expect(Number(product?.price)).toBe(9999); // NUNCA se toca product.price
  });

  it("GET /price-lists: lista la planilla con counts", async () => {
    const res = await request(app)
      .get("/api/price-lists")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: any) => i.id === priceListId);
    expect(item).toBeDefined();
    expect(item.type).toBe("SECO");
    expect(item.period).toBe("2026-08-10");
    expect(item.sectionsCount).toBe(1);
    expect(item.entriesCount).toBe(1);
  });

  it("GET /price-lists/:id: jerarquía del PDF con la entry importada", async () => {
    const res = await request(app)
      .get(`/api/price-lists/${priceListId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sections).toHaveLength(1);
    const entry = res.body.sections[0].entries[0];
    expect(entry).toMatchObject({
      name: "SIEGER Puppy Mini x 1 Kg.",
      productId,
      priceSinIva: 8795,
      priceConIva: 10642,
      suggestedPrice: 14190.04,
      matched: true,
    });
  });

  it("re-import del mismo período: idempotente, sin duplicados", async () => {
    const previewRes = await request(app)
      .post("/api/products/import-price-list?dryRun=true")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", fixturePath);
    const rows = previewRes.body.rows;
    const decisions = rows.map((r: any) => ({
      position: r.position,
      accion: r.estado === "matched" || r.estado === "multi-match" ? "import" : "omit",
      productId: r.productId ?? undefined,
      nombre: r.nombre,
      marca: r.marca,
      linea: r.linea,
      sublinea: r.sublinea,
      unidadEmpaque: r.unidadEmpaque,
      precioSinIva: r.precioSinIva,
      precioConIva: r.precioConIva,
    }));

    const applyRes = await request(app)
      .post("/api/products/import-price-list/apply")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        layout: previewRes.body.layout,
        period: previewRes.body.period,
        sourceFilename: previewRes.body.sourceFilename,
        rows: decisions,
      });
    expect(applyRes.status).toBe(200);

    // Idempotencia (design D1/D2): el re-import BORRA y RECREA la planilla del
    // mismo (org, type, period) → el id PUEDE cambiar. Lo que NO puede pasar
    // es que queden 2 planillas o 2 entradas para el mismo período.
    expect(applyRes.body.priceListId).toBeTruthy();

    const listRes = await request(app)
      .get("/api/price-lists")
      .set("Authorization", `Bearer ${adminToken}`);
    const items = listRes.body.items.filter((i: any) => i.period === "2026-08-10");
    expect(items).toHaveLength(1);

    // La planilla recreada (id nuevo) tiene UNA sola entry: sin duplicados.
    const detailRes = await request(app)
      .get(`/api/price-lists/${applyRes.body.priceListId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const entries = detailRes.body.sections.flatMap((s: any) => s.entries);
    expect(entries).toHaveLength(1);
  });

  it("404 cross-org: la org 2 NO ve la planilla de la org 1", async () => {
    const res = await request(app)
      .get(`/api/price-lists/${priceListId}`)
      .set("Authorization", `Bearer ${org2Token}`);
    expect(res.status).toBe(404);
  });

  /**
   * apply-prices (sdd/alican-wholesale-price-list/apply-prices). Corrido AL
   * FINAL del flujo a propósito: crea un producto nuevo en la org, y un re-
   * preview posterior lo matchearía (rompería los asserts de idempotencia).
   * Con applyPrices=true: el matcheado actualiza product.price al Con IVA y el
   * no matcheado se crea automáticamente (name + price Con IVA, sin categoría).
   */
  it("apply con applyPrices=true: actualiza product.price del matcheado y crea el no matcheado", async () => {
    const previewRes = await request(app)
      .post("/api/products/import-price-list?dryRun=true")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", fixturePath);
    expect(previewRes.status).toBe(200);

    const rows = previewRes.body.rows as any[];
    const matched = rows.find((r: any) => r.estado === "matched");
    const unmatched = rows.find((r: any) => r.estado === "unmatched");
    expect(matched).toBeDefined();
    expect(unmatched).toBeDefined();

    const decisions = [matched, unmatched].map((r: any) => ({
      position: r.position,
      accion: "import",
      productId: r.productId ?? undefined,
      nombre: r.nombre,
      marca: r.marca,
      linea: r.linea,
      sublinea: r.sublinea,
      unidadEmpaque: r.unidadEmpaque,
      precioSinIva: r.precioSinIva,
      precioConIva: r.precioConIva,
    }));

    const applyRes = await request(app)
      .post("/api/products/import-price-list/apply")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        layout: previewRes.body.layout,
        period: previewRes.body.period,
        sourceFilename: previewRes.body.sourceFilename,
        applyPrices: true,
        rows: decisions,
      });

    expect(applyRes.status).toBe(200);
    expect(applyRes.body.priceUpdated).toBe(1);
    expect(applyRes.body.productsCreated).toBe(1);

    const product = await basePrisma.product.findFirst({ where: { id: productId } });
    expect(Number(product?.price)).toBe(10642); // Con IVA directo, sin markup

    const createdProduct = await basePrisma.product.findFirst({
      where: { organizationId, name: unmatched.nombre },
    });
    expect(createdProduct).toBeTruthy();
    expect(Number(createdProduct?.price)).toBe(unmatched.precioConIva);
    expect(createdProduct?.categoryId).toBeNull();
  });

  it("rechaza un layout no reconocido con 400", async () => {
    const res = await request(app)
      .post("/api/products/import-price-list?dryRun=true")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from("FACTURA GENERICA SIN COLUMNAS"), {
        filename: "no-es-planilla.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(400);
  });
});

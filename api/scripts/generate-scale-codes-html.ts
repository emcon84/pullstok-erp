/**
 * Genera una página HTML imprimible con el listado de códigos de balanza
 * (scaleCode) de las celdas sueltas, agrupados por marca madre. Para que los
 * vendedores lo tengan a mano y sepan qué código tipear en la balanza.
 *
 * Salida a stdout → redirigí a un .html y abrí en el navegador (Ctrl+P).
 *
 * Env:
 *   ORG_SLUG = slug de la organización (default el-almacen-de-las-mascotas)
 *
 * Usage:
 *   npx ts-node scripts/generate-scale-codes-html.ts > codigos-balanza.html
 */
import "dotenv/config";
import { basePrisma } from "../src/config/db";
import { parentBrandOf } from "./assign-scale-codes";

const DEFAULT_ORG_SLUG = "el-almacen-de-las-mascotas";

export const resolveOrgSlug = (env: NodeJS.ProcessEnv = process.env): string =>
  env.ORG_SLUG || DEFAULT_ORG_SLUG;

export const formatMoney = (n: number): string =>
  "$" + n.toLocaleString("es-AR");

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Row {
  code: string;
  parentBrand: string;
  brand: string;
  type: string;
  species: string;
  priceKg: number;
}

export function renderHtml(rows: Row[], orgName: string): string {
  const byParent = new Map<string, Row[]>();
  for (const r of rows) {
    const arr = byParent.get(r.parentBrand) ?? [];
    arr.push(r);
    byParent.set(r.parentBrand, arr);
  }
  const parents = [...byParent.keys()].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );

  const sections = parents
    .map((parent) => {
      const items = byParent
        .get(parent)!
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      const rowsHtml = items
        .map(
          (i) =>
            `<tr><td class="code">${esc(i.code)}</td><td>${esc(`${i.brand} ${i.type} ${i.species}`)}</td><td class="price">${formatMoney(i.priceKg)}</td></tr>`,
        )
        .join("\n");
      return (
        `<tr class="brand"><td colspan="3">${esc(parent)}</td></tr>\n` + rowsHtml
      );
    })
    .join("\n");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Códigos de balanza — Alimento suelto</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #555; font-size: 13px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th { text-align: left; background: #f0f0f0; padding: 6px 8px; border-bottom: 2px solid #ccc; position: sticky; top: 0; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  tr.brand td { font-weight: 700; background: #eef3ff; border-bottom: 2px solid #b9c6e6; padding: 8px; font-size: 14px; }
  td.code { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-weight: 700; width: 90px; }
  td.price { text-align: right; white-space: nowrap; width: 110px; }
  @media print {
    body { margin: 0; }
    th { position: static; }
  }
</style>
</head>
<body>
  <h1>Códigos de balanza — Alimento suelto</h1>
  <div class="sub">${esc(orgName)} · Tipeá el código en la balanza para cada producto suelto.</div>
  <table>
    <thead><tr><th>Código</th><th>Producto</th><th>Precio/kg</th></tr></thead>
    <tbody>
${sections}
    </tbody>
  </table>
</body>
</html>
`;
}

async function main() {
  const slug = resolveOrgSlug();
  const org = await basePrisma.organization.findFirst({ where: { slug } });
  if (!org) throw new Error(`Organización no encontrada (slug='${slug}')`);

  const [brands, types, cells] = await Promise.all([
    basePrisma.priceKgBrand.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } }),
    basePrisma.priceKgType.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } }),
    basePrisma.priceKgPrice.findMany({
      where: { organizationId: org.id, scaleCode: { not: null } },
      select: { id: true, brandId: true, typeId: true, species: true, priceKg: true, scaleCode: true },
    }),
  ]);

  const brandById = new Map(brands.map((b) => [b.id, b.name]));
  const typeById = new Map(types.map((t) => [t.id, t.name]));

  const rows: Row[] = cells
    .filter((c) => c.scaleCode)
    .map((c) => {
      const brand = brandById.get(c.brandId) ?? "";
      return {
        code: c.scaleCode as string,
        parentBrand: parentBrandOf(brand),
        brand,
        type: typeById.get(c.typeId) ?? "",
        species: c.species,
        priceKg: c.priceKg,
      };
    });

  process.stdout.write(renderHtml(rows, org.name));
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("FATAL:", err);
      process.exit(1);
    })
    .finally(async () => {
      await basePrisma.$disconnect();
    });
}

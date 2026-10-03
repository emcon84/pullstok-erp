/**
 * Alta masiva de clientes o proveedores desde los listados del sistema legado
 * GFLOW ("listado de clientes.xls" / "listado de proveedores.xls").
 *
 * Lee un JSON ya normalizado (array de objetos con `code` + los campos de
 * FIELDS[entity]). El archivo NO se versiona (trae CUITs y datos de contacto):
 * se copia al VPS y se pasa por --file.
 *
 * Idempotente por (organizationId, code): crea los que faltan y actualiza los
 * existentes solo cuando algún campo difiere. Nunca borra ni desactiva.
 *
 * Standalone ts-node — correr EN EL VPS. Dry-run por defecto; --apply escribe.
 *
 *   npx ts-node prisma/load-gflow-contacts.ts --entity customers --org satic-sa --file /root/satic-customers.json
 *   npx ts-node prisma/load-gflow-contacts.ts --entity providers --org satic-sa --file /root/satic-providers.json --apply
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const COMMON = ["name", "taxId", "taxCondition", "address", "locality", "province", "phone", "email"];

const FIELDS = {
  customers: [...COMMON, "zone"],
  providers: [...COMMON, "classification", "accountingRef"],
} as const;

type Entity = keyof typeof FIELDS;
type Row = Record<string, string | null> & { code: string };
type Existing = Row & { id: string };

/** Acceso uniforme a customer/provider: ambos se scopean por organizationId y code. */
const repo = (entity: Entity, client: Pick<PrismaClient, "customer" | "provider">) => {
  const delegate = (entity === "customers" ? client.customer : client.provider) as unknown as {
    findMany(args: object): Promise<Existing[]>;
    createMany(args: object): Promise<unknown>;
    update(args: object): Promise<unknown>;
  };
  return delegate;
};

const argValue = (args: string[], flag: string): string | null =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] ?? null : null;

async function main() {
  const args = process.argv.slice(2);
  const entity = argValue(args, "--entity") as Entity | null;
  const orgSlug = argValue(args, "--org");
  const file = argValue(args, "--file");
  const apply = args.includes("--apply");

  if (!entity || !(entity in FIELDS) || !orgSlug || !file) {
    console.error(
      "Usage: npx ts-node prisma/load-gflow-contacts.ts --entity customers|providers --org <slug> --file <json> [--apply]",
    );
    process.exit(1);
  }
  const fields = FIELDS[entity];

  const rows: Row[] = JSON.parse(readFileSync(file, "utf-8"));
  const codes = new Set(rows.map((r) => r.code));
  if (codes.size !== rows.length) {
    console.error("❌ Duplicate codes in input file");
    process.exit(1);
  }

  const org = await db.organization.findFirst({ where: { slug: orgSlug } });
  if (!org) {
    console.error(`❌ Organization not found: ${orgSlug}`);
    process.exit(1);
  }
  const orgId = org.id;
  console.log(`🔍 ${rows.length} ${entity} GFLOW → ${org.name} (${orgId})`);

  const existing = await repo(entity, db).findMany({
    where: { organizationId: orgId, code: { in: [...codes] } },
  });
  const byCode = new Map(existing.map((e) => [e.code, e]));

  const toCreate: Row[] = [];
  const toUpdate: Array<{ id: string; code: string; data: Record<string, string | null> }> = [];

  for (const row of rows) {
    const current = byCode.get(row.code);
    if (!current) {
      toCreate.push(row);
      continue;
    }
    const data: Record<string, string | null> = {};
    for (const f of fields) {
      if ((current[f] ?? null) !== (row[f] ?? null)) data[f] = row[f] ?? null;
    }
    if (Object.keys(data).length) toUpdate.push({ id: current.id, code: row.code, data });
  }

  console.log(`   Crear: ${toCreate.length} | Actualizar: ${toUpdate.length} | Sin cambios: ${rows.length - toCreate.length - toUpdate.length}`);
  for (const u of toUpdate.slice(0, 20)) {
    console.log(`   ~ ${u.code}: ${Object.keys(u.data).join(", ")}`);
  }

  if (!apply) {
    console.log("\n🧪 Dry-run. Para escribir:");
    console.log(`   npx ts-node prisma/load-gflow-contacts.ts --entity ${entity} --org ${orgSlug} --file ${file} --apply`);
    return;
  }

  await db.$transaction(async (tx) => {
    const target = repo(entity, tx);
    if (toCreate.length) {
      await target.createMany({
        data: toCreate.map((r) => ({
          code: r.code,
          ...Object.fromEntries(fields.map((f) => [f, r[f] ?? null])),
          organizationId: orgId,
        })),
      });
    }
    for (const u of toUpdate) {
      await target.update({ where: { id: u.id, organizationId: orgId }, data: u.data });
    }
  });

  console.log(`✅ Listo: ${toCreate.length} creados, ${toUpdate.length} actualizados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

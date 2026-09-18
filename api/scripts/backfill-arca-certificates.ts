// Script: backfill ArcaCertificate desde los certs YA existentes en el disco
// del VPS hacia el storage self-service nuevo (cifrado en DB, sdd/arca-
// certificados-self-service, T5). El ARCA de la org destino sigue funcionando
// con ArcaSetting.certPath/keyPath (deprecated, no se tocan acá) hasta que
// T4 (wsaaClient.ts) ya lee de ArcaCertificate — este backfill es lo que
// puebla esa tabla para que el corte no rompa la emisión fiscal en curso.
//
// Convención de rutas por org+ambiente en el VPS (misma que ArcaSetting.
// certPath/keyPath legacy, documentada en .env.production.example):
//   /var/www/pullstok/certs/{organizationId}/wswfev1-{HOMOLOGACION|PRODUCCION}.crt
//   /var/www/pullstok/certs/{organizationId}/wswfev1-{HOMOLOGACION|PRODUCCION}.key
//
// Seguridad: aborta SIN escribir nada si un par cert/key no matchea (nunca
// backfillea un par inconsistente). No hay comportamiento parcial por
// ambiente: si HOMOLOGACION falla la validación, PRODUCCION no se procesa.
//
// Never run locally (no hay Postgres local, CLAUDE.md) — correr en el VPS:
//   root@72.61.25.48, /var/www/pullstok.
//
// Usage (ts-node en el VPS, mismo patrón que assign-blister-barcodes.ts):
//   TS_NODE_PROJECT=/var/www/pullstok/api/tsconfig.json \
//     npx ts-node --transpile-only scripts/backfill-arca-certificates.ts --dry-run
//   ... --apply
//   ... <organizationId> --apply   (organizationId opcional, default abajo)
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  parseCertificatePem,
  privateKeyMatchesCertificate,
} from "../src/utils/certParsing";
import { encryptPrivateKeyPem } from "../src/utils/certEncryption";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// El Almacén de las Mascotas / Don Colacho SRL — org con certs reales ya en
// el VPS hoy (ver odd/tasks/arca-certificados-self-service.md).
const DEFAULT_ORG = "1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b";
const CERTS_ROOT = "/var/www/pullstok/certs";
const ENVIRONMENTS = ["HOMOLOGACION", "PRODUCCION"] as const;
type Environment = (typeof ENVIRONMENTS)[number];

// No hay un User "sistema" — la fila deja constancia honesta de que la
// pobló este script, no un ADMIN desde la UI.
const BACKFILL_UPLOADED_BY = "backfill-script:backfill-arca-certificates";

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "dry-run";
const orgIdArg = args.find((a) => !a.startsWith("--"));
const TARGET_ORG = orgIdArg || DEFAULT_ORG;

const certPathFor = (organizationId: string, environment: Environment): string =>
  path.join(CERTS_ROOT, organizationId, `wswfev1-${environment}.crt`);
const keyPathFor = (organizationId: string, environment: Environment): string =>
  path.join(CERTS_ROOT, organizationId, `wswfev1-${environment}.key`);

async function processEnvironment(
  organizationId: string,
  environment: Environment,
): Promise<void> {
  const certPath = certPathFor(organizationId, environment);
  const keyPath = keyPathFor(organizationId, environment);

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.log(`  [skip] ${environment}: no se encontró ${certPath} y/o ${keyPath}`);
    return;
  }

  const certPem = fs.readFileSync(certPath, "utf8");
  const keyPemBuffer = fs.readFileSync(keyPath, "utf8");

  const parsed = parseCertificatePem(certPem);
  const matches = privateKeyMatchesCertificate(certPem, keyPemBuffer);
  if (!matches) {
    throw new Error(
      `${environment}: la clave privada (${keyPath}) NO corresponde al certificado ` +
        `(${certPath}). Abortando sin escribir nada — revisar el par manualmente.`,
    );
  }

  console.log(
    `  ${environment}: subject=${parsed.subjectCn ?? "(sin CN)"} ` +
      `cuit=${parsed.subjectCuit ?? "(sin CUIT)"} issuer=${parsed.issuer} ` +
      `vigencia=${parsed.validFrom.toISOString()} -> ${parsed.validTo.toISOString()}` +
      `${parsed.isExpired ? " (VENCIDO)" : ""}`,
  );

  if (mode !== "apply") {
    console.log(`  [dry-run] ${environment}: no se escribió nada.`);
    return;
  }

  const encrypted = encryptPrivateKeyPem(keyPemBuffer);
  // Prisma 7 tipa Bytes como Uint8Array<ArrayBuffer>; Buffer (Node) es
  // Uint8Array<ArrayBufferLike> — copiar a un Uint8Array fresco.
  const keyCiphertext = Uint8Array.from(encrypted.ciphertext);
  const keyIv = Uint8Array.from(encrypted.iv);
  const keyAuthTag = Uint8Array.from(encrypted.authTag);

  await prisma.arcaCertificate.upsert({
    where: { organizationId_environment: { organizationId, environment } },
    update: {
      certPem,
      keyCiphertext,
      keyIv,
      keyAuthTag,
      subjectCn: parsed.subjectCn,
      subjectCuit: parsed.subjectCuit,
      issuer: parsed.issuer,
      validFrom: parsed.validFrom,
      validTo: parsed.validTo,
      uploadedByUserId: BACKFILL_UPLOADED_BY,
    },
    create: {
      organizationId,
      environment,
      certPem,
      keyCiphertext,
      keyIv,
      keyAuthTag,
      subjectCn: parsed.subjectCn,
      subjectCuit: parsed.subjectCuit,
      issuer: parsed.issuer,
      validFrom: parsed.validFrom,
      validTo: parsed.validTo,
      uploadedByUserId: BACKFILL_UPLOADED_BY,
    },
  });
  console.log(`  [apply] ${environment}: ArcaCertificate upsert OK.`);
}

async function main() {
  console.log(`Mode: ${mode}`);
  console.log(`Target org: ${TARGET_ORG}`);

  for (const environment of ENVIRONMENTS) {
    console.log(`\n=== ${environment} ===`);
    await processEnvironment(TARGET_ORG, environment);
  }

  if (mode !== "apply") {
    console.log("\nDRY-RUN only. No rows written. Re-run con --apply para escribir.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});

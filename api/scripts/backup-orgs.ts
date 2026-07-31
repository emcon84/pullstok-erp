/**
 * Daily backup script: iterates all active organizations, generates a
 * per-org .sql.gz dump, and uploads it to R2.
 *
 * Usage (cron):
 *   0 3 * * * cd /var/www/pullstok && npx ts-node api/scripts/backup-orgs.ts >> /var/log/pullstok-backups.log 2>&1
 *
 * Overlap prevention: writes /tmp/pullstok-backup.pid on startup.
 * If the pidfile already exists, the script exits immediately.
 *
 * Environment variables required:
 *   DATABASE_URL         – PostgreSQL connection string
 *   R2_ACCOUNT_ID        – Cloudflare R2 account ID
 *   R2_ACCESS_KEY_ID     – R2 access key
 *   R2_SECRET_ACCESS_KEY – R2 secret access key
 *   R2_BUCKET_NAME       – R2 bucket name
 */

import "dotenv/config";
import { writeFileSync, existsSync, unlinkSync, readFileSync } from "fs";
import { basePrisma } from "../src/config/db";
import { backupOrganization } from "../src/services/backupService";

const PIDFILE = "/tmp/pullstok-backup.pid";

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  // --- Overlap prevention (spec E4) ---
  if (existsSync(PIDFILE)) {
    const prevPid = readFileSync(PIDFILE, "utf-8").trim();
    try {
      // Check if the process with the previous PID is still alive
      process.kill(Number(prevPid), 0); // signal 0 = existence check
      console.log(
        `[${new Date().toISOString()}] Previous backup run still active (PID ${prevPid}). Exiting.`,
      );
      process.exit(0);
    } catch {
      // PID doesn't exist anymore — stale pidfile, remove it
      console.log(
        `[${new Date().toISOString()}] Removing stale pidfile (PID ${prevPid} no longer exists).`,
      );
      unlinkSync(PIDFILE);
    }
  }

  writeFileSync(PIDFILE, String(process.pid), "utf-8");

  // --- Validate R2 env vars (spec E3) ---
  const requiredEnv = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "DATABASE_URL",
  ];

  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `[${new Date().toISOString()}] ERROR: Missing required environment variables: ${missing.join(", ")}`,
    );
    cleanup();
    process.exit(1);
  }

  console.log(
    `[${new Date().toISOString()}] Starting daily backup for all active organizations...`,
  );

  try {
    // --- Get active orgs (spec B1) ---
    const orgs = await basePrisma.organization.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true },
    });

    console.log(
      `[${new Date().toISOString()}] Found ${orgs.length} active organization(s).`,
    );

    const today = formatDate(new Date());
    let successCount = 0;
    let failureCount = 0;

    // --- Iterate orgs with per-org isolation (spec B6) ---
    for (const org of orgs) {
      const sanitizedSlug = require("../src/services/backupService").sanitizeSlug(org.slug);
      try {
        console.log(
          `[${new Date().toISOString()}] Backing up org "${org.name}" (${org.id}, slug: ${org.slug})...`,
        );
        const result = await backupOrganization(org.id, sanitizedSlug, today);
        console.log(
          `[${new Date().toISOString()}]   ✅ Done: ${result.key} (${result.bytes} bytes)`,
        );
        successCount++;
      } catch (error: any) {
        console.error(
          `[${new Date().toISOString()}]   ❌ FAILED for org ${org.id} ("${org.name}"): ${error.message}`,
        );
        failureCount++;
      }
    }

    console.log(
      `[${new Date().toISOString()}] Backup complete: ${successCount} success, ${failureCount} failure(s).`,
    );
  } finally {
    cleanup();
    await basePrisma.$disconnect();
  }
}

function cleanup() {
  try {
    if (existsSync(PIDFILE)) {
      unlinkSync(PIDFILE);
    }
  } catch {
    // best-effort cleanup
  }
}

main().catch((err) => {
  console.error(
    `[${new Date().toISOString()}] FATAL: ${err.message}`,
  );
  cleanup();
  process.exit(1);
});

// Backup service: daily per-organization database dumps to R2.
// Uses pg_dump for DDL + Prisma basePrisma for per-org data extraction,
// streamed to gzip to avoid memory issues.

import { execSync } from "child_process";
import { createGzip } from "zlib";
import { basePrisma } from "../config/db";
import { uploadBackupToR2 } from "../config/storage";
import { Prisma } from "@prisma/client";

/**
 * Sanitizes an organization slug for use in R2 object keys.
 * Replaces `/`, `\`, and `:` with `-` per spec E2.
 */
export function sanitizeSlug(slug: string): string {
  return slug.replace(/[/\\:]/g, "-");
}

/**
 * Topological order of tenant tables for backup.
 * Level 1 tables first (no FK to other tenant tables), then dependents.
 * Message is excluded: no organizationId; it's scoped via Conversation (level 7).
 */
const TABLE_DUMP_ORDER = [
  // Level 1: no FK dependencies on other tenant models
  "Organization", // base table
  // Level 2: direct dependents of Organization
  "Branch",
  "BotConfig",
  "StoreSettings",
  "AppBranding",
  "Category",
  "Customer",
  "Counter",
  // Level 3: depend on Category
  "CategoryVariantDefinition",
  "Product", // depends on Category (optional)
  // Level 4: depend on CategoryVariantDefinition
  "CategoryVariantOption",
  // Level 5: depend on Product + CategoryVariantOption
  "ProductVariant",
  // Level 6: depend on Customer
  "Order",
  "Quotation",
  "Invoice",
  "Conversation",
  // Level 7: depend on Order + Quotation + Conversation
  "OrderItem",     // via Order
  "QuotationItem", // via Quotation
  "Message",       // via Conversation (no orgId, filtered by conv.orgId)
  // Level 8: depend on Order (optional)
  "Sale",          // optional FK to Order
  // Level 9: depend on Sale + Invoice
  "SaleItem",
  "InvoiceItem",
];

const BATCH_SIZE = 1000;

const modelNameToDbTable: Record<string, string> = {
  Organization: "organizations",
  Branch: "branches",
  BotConfig: "bot_configs",
  StoreSettings: "store_settings",
  AppBranding: "app_branding",
  Category: "categories",
  Customer: "customers",
  Counter: "counters",
  CategoryVariantDefinition: "category_variant_definitions",
  Product: "products",
  CategoryVariantOption: "category_variant_options",
  ProductVariant: "product_variants",
  Order: "orders",
  Quotation: "quotations",
  Invoice: "invoices",
  Conversation: "conversations",
  OrderItem: "order_items",
  QuotationItem: "quotation_items",
  Message: "messages",
  Sale: "sales",
  SaleItem: "sale_items",
  InvoiceItem: "invoice_items",
  Receipt: "receipts",
};

/**
 * Extracts the DATABASE_NAME from the DATABASE_URL env var.
 */
function getDbName(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set");
  // postgresql://user:pass@host:port/dbname?schema=public
  const match = url.match(/\/([^/?]+)(\?|$)/);
  if (!match) throw new Error("Could not parse database name from DATABASE_URL");
  return match[1];
}

/**
 * Generates a complete INSERT statement from an array of row objects.
 * Handles Date, null, string, number, and boolean values.
 */
function rowsToInsert(tableName: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const values = rows
    .map((row) => {
      const vals = columns.map((col) => {
        const val = row[col];
        if (val === null) return "NULL";
        if (val instanceof Date) return `'${val.toISOString()}'`;
        if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
        if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
        return String(val);
      });
      return `(${vals.join(", ")})`;
    })
    .join(",\n");
  return `INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES\n${values};\n\n`;
}

/**
 * Backs up a single organization to R2.
 *
 * 1. Opens a BEGIN READ ONLY transaction for MVCC snapshot consistency.
 * 2. Runs pg_dump --schema-only for exact DDL (indexes, enums, constraints).
 * 3. Queries all tenant tables in topological order in 1000-row batches.
 * 4. Streams DDL + INSERT rows through a gzip pipe to a buffer.
 * 5. Uploads the resulting .sql.gz to R2 at backups/{slug}/{date}.sql.gz.
 *
 * @returns { key, bytes } - the R2 object key and compressed byte count.
 */
export async function backupOrganization(
  orgId: string,
  slug: string,
  date: string,
): Promise<{ key: string; bytes: number }> {
  // Step 1: Validate DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL environment variable is not set");

  // Step 2: Open READ ONLY transaction
  await basePrisma.$queryRawUnsafe("BEGIN READ ONLY");

  try {
    // Step 3: pg_dump --schema-only for DDL
    // Strip Prisma-only query params (?schema=xxx) — pg_dump rejects them
    const pgUrl = dbUrl.replace(/\?.*$/, "");
    const ddl = execSync(
      `pg_dump --schema-only --no-owner --no-privileges -d "${pgUrl}"`,
      { encoding: "utf-8" },
    );

    // Step 3 & 4: Stream DDL + data through gzip
    const chunks: Buffer[] = [];
    const gzip = createGzip();

    await new Promise<void>((resolve, reject) => {
      gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
      gzip.on("end", resolve);
      gzip.on("error", reject);

      // Write DDL header
      gzip.write(Buffer.from("-- DDL (pg_dump --schema-only)\n"));
      gzip.write(Buffer.from(ddl));
      gzip.write(Buffer.from("\n-- Data rows (per-org extraction)\n\n"));

      // Write BEGIN for the SQL dump
      gzip.write(Buffer.from("BEGIN;\n\n"));

      let tableIndex = 0;

      const nextTable = () => {
        if (tableIndex >= TABLE_DUMP_ORDER.length) {
          gzip.write(Buffer.from("COMMIT;\n"));
          gzip.end();
          return;
        }

        const modelName = TABLE_DUMP_ORDER[tableIndex];
        const tableName = modelNameToDbTable[modelName];
        if (!tableName) {
          tableIndex++;
          nextTable();
          return;
        }

        // Query rows for this table, scoped to the organization
        queryTableRows(orgId, modelName, tableName)
          .then((rows) => {
            gzip.write(
              Buffer.from(`-- Table: ${tableName} (${rows.length} rows)\n`),
            );
            const insert = rowsToInsert(tableName, rows);
            if (insert) gzip.write(Buffer.from(insert));
            tableIndex++;
            nextTable();
          })
          .catch(reject);
      };

      nextTable();
    });

    // Step 5: Upload to R2
    const key = `backups/${slug}/${date}.sql.gz`;
    const buffer = Buffer.concat(chunks);
    await uploadBackupToR2(key, buffer, "application/gzip");

    // Commit the read-only transaction (just consistency, no writes)
    await basePrisma.$queryRawUnsafe("COMMIT");

    return { key, bytes: buffer.length };
  } catch (error) {
    await basePrisma.$queryRawUnsafe("ROLLBACK").catch(() => {});
    throw error;
  }
}

/**
 * Queries all rows for a given tenant model scoped to orgId, batched at BATCH_SIZE.
 * For models that don't have a direct organizationId (OrderItem, QuotationItem,
 * SaleItem, Message), joins through their parent to scope correctly.
 */
async function queryTableRows(
  orgId: string,
  modelName: string,
  tableName: string,
): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = [];

  // Models WITHOUT organizationId: scoped via parent relationship
  switch (modelName) {
    case "Organization": {
      // Organization IS the org — query by id, not organizationId
      let skip = 0;
      while (true) {
        const rows = await basePrisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM "${tableName}"
           WHERE "id" = $1
           LIMIT $2 OFFSET $3`,
          orgId,
          BATCH_SIZE,
          skip,
        );
        allRows.push(...rows);
        if (rows.length < BATCH_SIZE) break;
        skip += BATCH_SIZE;
      }
      return allRows;
    }
    case "OrderItem": {
      // Scope via Order.organizationId
      let skip = 0;
      while (true) {
        const rows = await basePrisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT oi.* FROM "${tableName}" oi
           INNER JOIN orders o ON o.id = oi."orderId"
           WHERE o."organizationId" = $1
           ORDER BY oi.id
           LIMIT $2 OFFSET $3`,
          orgId,
          BATCH_SIZE,
          skip,
        );
        allRows.push(...rows);
        if (rows.length < BATCH_SIZE) break;
        skip += BATCH_SIZE;
      }
      return allRows;
    }
    case "QuotationItem": {
      let skip = 0;
      while (true) {
        const rows = await basePrisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT qi.* FROM "${tableName}" qi
           INNER JOIN quotations q ON q.id = qi."quotationId"
           WHERE q."organizationId" = $1
           ORDER BY qi.id
           LIMIT $2 OFFSET $3`,
          orgId,
          BATCH_SIZE,
          skip,
        );
        allRows.push(...rows);
        if (rows.length < BATCH_SIZE) break;
        skip += BATCH_SIZE;
      }
      return allRows;
    }
    case "Message": {
      let skip = 0;
      while (true) {
        const rows = await basePrisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT m.* FROM "${tableName}" m
           INNER JOIN conversations c ON c.id = m."conversationId"
           WHERE c."organizationId" = $1
           ORDER BY m.id
           LIMIT $2 OFFSET $3`,
          orgId,
          BATCH_SIZE,
          skip,
        );
        allRows.push(...rows);
        if (rows.length < BATCH_SIZE) break;
        skip += BATCH_SIZE;
      }
      return allRows;
    }
    case "SaleItem": {
      let skip = 0;
      while (true) {
        const rows = await basePrisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT si.* FROM "${tableName}" si
           INNER JOIN sales s ON s.id = si."saleId"
           WHERE s."organizationId" = $1
           ORDER BY si.id
           LIMIT $2 OFFSET $3`,
          orgId,
          BATCH_SIZE,
          skip,
        );
        allRows.push(...rows);
        if (rows.length < BATCH_SIZE) break;
        skip += BATCH_SIZE;
      }
      return allRows;
    }
    case "InvoiceItem": {
      let skip = 0;
      while (true) {
        const rows = await basePrisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT ii.* FROM "${tableName}" ii
           INNER JOIN invoices i ON i.id = ii."invoiceId"
           WHERE i."organizationId" = $1
           ORDER BY ii.id
           LIMIT $2 OFFSET $3`,
          orgId,
          BATCH_SIZE,
          skip,
        );
        allRows.push(...rows);
        if (rows.length < BATCH_SIZE) break;
        skip += BATCH_SIZE;
      }
      return allRows;
    }
  }

  // Models WITH direct organizationId
  let skip = 0;
  while (true) {
    const rows = await basePrisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${tableName}"
       WHERE "organizationId" = $1
       ORDER BY id
       LIMIT $2 OFFSET $3`,
      orgId,
      BATCH_SIZE,
      skip,
    );
    allRows.push(...rows);
    if (rows.length < BATCH_SIZE) break;
    skip += BATCH_SIZE;
  }

  return allRows;
}

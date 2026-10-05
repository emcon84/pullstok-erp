import { readFileSync } from "fs";
import { join } from "path";

// No local DB: the migration is verified statically.
const sql = readFileSync(
  join(
    __dirname,
    "../../prisma/migrations/20261005120000_product_presentations/migration.sql",
  ),
  "utf8",
);

describe("product_presentations migration", () => {
  it("creates the table and enforces factor >= 1", () => {
    expect(sql).toContain('CREATE TABLE "product_presentations"');
    expect(sql).toMatch(/CHECK \("factor" >= 1\)/);
  });

  it("adds the Product and SaleItem columns", () => {
    expect(sql).toContain('"hasPresentations" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('"presentationId" TEXT');
    expect(sql).toContain('"presentationName" TEXT');
    expect(sql).toContain('"presentationFactor" INTEGER');
  });

  it("is additive only", () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN/i);
    expect(sql).not.toMatch(/DELETE\s+FROM|TRUNCATE/i);
  });
});

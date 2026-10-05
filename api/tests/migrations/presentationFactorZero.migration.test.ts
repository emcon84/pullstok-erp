import { readFileSync } from "fs";
import { join } from "path";

// No local DB: the migration is verified statically.
const sql = readFileSync(
  join(
    __dirname,
    "../../prisma/migrations/20261005130000_presentation_factor_zero/migration.sql",
  ),
  "utf8",
);

describe("presentation_factor_zero migration", () => {
  it("replaces the factor CHECK with factor >= 0", () => {
    expect(sql).toMatch(/DROP CONSTRAINT "product_presentations_factor_check"/);
    expect(sql).toMatch(
      /ADD CONSTRAINT "product_presentations_factor_check" CHECK \("factor" >= 0\)/,
    );
  });

  it("does not touch data or columns", () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(sql).not.toMatch(/DELETE\s+FROM|TRUNCATE|UPDATE\s/i);
  });
});

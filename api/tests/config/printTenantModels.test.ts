import { readFileSync } from "fs";
import { join } from "path";

// db.ts crea el PrismaClient al importarse, así que verificamos TENANT_MODELS
// leyendo el código fuente (no hay BD local).
describe("TENANT_MODELS", () => {
  const src = readFileSync(join(__dirname, "../../src/config/db.ts"), "utf8");
  const block = src.slice(src.indexOf("const TENANT_MODELS"), src.indexOf("]);"));

  it.each(["Printer", "PrintAgent", "PrintJob"])("includes %s", (model) => {
    expect(block).toContain(`"${model}"`);
  });
});

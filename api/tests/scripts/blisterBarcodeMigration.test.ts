import { shouldAssignBlisterBarcode } from "../../prisma/scripts/blisterBarcodeMigration";

describe("shouldAssignBlisterBarcode", () => {
  it("true para un producto BLISTER sin barcode", () => {
    expect(shouldAssignBlisterBarcode("IBUPIRAC 400 (BLISTER)", null)).toBe(true);
    expect(shouldAssignBlisterBarcode("blister generico", undefined)).toBe(true);
    expect(shouldAssignBlisterBarcode("BLISTER X", "")).toBe(true);
  });

  it("false si ya tiene barcode (idempotente, no lo pisa)", () => {
    expect(shouldAssignBlisterBarcode("IBUPIRAC 400 (BLISTER)", "BLST00001")).toBe(false);
  });

  it("false si el nombre no matchea BLISTER", () => {
    expect(shouldAssignBlisterBarcode("IBUPIRAC 400", null)).toBe(false);
    expect(shouldAssignBlisterBarcode("ROYAL CANIN X 15 KG", null)).toBe(false);
  });
});

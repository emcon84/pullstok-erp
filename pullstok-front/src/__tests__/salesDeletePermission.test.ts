import { describe, it, expect } from "vitest";
import { canDeleteSaleRole } from "../constants/rolePermissions";

describe("canDeleteSaleRole", () => {
  it("permite ADMIN, MANAGEMENT y VENDEDOR", () => {
    for (const r of ["ADMIN", "MANAGEMENT", "VENDEDOR"]) expect(canDeleteSaleRole(r)).toBe(true);
  });
  it("niega CASHIER, EMPLOYEE y vacío", () => {
    for (const r of ["CASHIER", "EMPLOYEE", undefined, null]) expect(canDeleteSaleRole(r)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { navItems, vendorSimpleNav } from "../components/molecules/sidebar/navItems";
import { filterNavItemsByRole } from "../constants/rolePermissions";

describe("VENDEDOR: stock suelto y carga manual", () => {
  const visible = (role: string, to: string) =>
    filterNavItemsByRole(navItems, role).some((i) => i.to === to);

  it("Stock suelto visible para ADMIN/MANAGEMENT/VENDEDOR, no para CASHIER/EMPLOYEE", () => {
    expect(visible("ADMIN", "/stock-suelto")).toBe(true);
    expect(visible("MANAGEMENT", "/stock-suelto")).toBe(true);
    expect(visible("VENDEDOR", "/stock-suelto")).toBe(true);
    expect(visible("CASHIER", "/stock-suelto")).toBe(false);
    expect(visible("EMPLOYEE", "/stock-suelto")).toBe(false);
  });

  it("el menú simple del vendedor incluye Carga manual y Stock suelto (este último con moduleKey)", () => {
    const manual = vendorSimpleNav.find((i) => i.to === "/carga-manual");
    const loose = vendorSimpleNav.find((i) => i.to === "/stock-suelto");
    expect(manual).toBeDefined();
    expect(loose?.moduleKey).toBe("suelto");
  });
});

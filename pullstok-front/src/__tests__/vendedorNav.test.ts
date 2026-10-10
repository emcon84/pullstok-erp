import { describe, it, expect } from "vitest";
import { navItems, vendorSimpleNav } from "../components/molecules/sidebar/navItems";
import { filterNavItemsByRole, roleAllows } from "../constants/rolePermissions";

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

describe("VENDEDOR: entrada Productos (listado completo con ProductDrawer)", () => {
  it("el menú simple del vendedor incluye /productos, junto a Carga manual", () => {
    const idx = vendorSimpleNav.findIndex((i) => i.to === "/productos");
    expect(idx).toBeGreaterThan(-1);
    expect(vendorSimpleNav[idx].label).toBe("Productos");
    expect(vendorSimpleNav[idx].moduleKey ?? null).toBeNull();
    const manual = vendorSimpleNav.findIndex((i) => i.to === "/carga-manual");
    expect(Math.abs(idx - manual)).toBe(1);
  });

  it("/productos es visible solo para ADMIN, MANAGEMENT y VENDEDOR", () => {
    expect(roleAllows("ADMIN", "/productos")).toBe(true);
    expect(roleAllows("MANAGEMENT", "/productos")).toBe(true);
    expect(roleAllows("VENDEDOR", "/productos")).toBe(true);
    expect(roleAllows("CASHIER", "/productos")).toBe(false);
    expect(roleAllows("EMPLOYEE", "/productos")).toBe(false);
  });

  it("el menú agrupado (ADMIN/MANAGEMENT) no se duplica con /productos", () => {
    expect(navItems.some((i) => i.to === "/productos")).toBe(false);
  });
});

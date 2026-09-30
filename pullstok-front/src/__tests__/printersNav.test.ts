import { describe, it, expect } from "vitest";
import { navItems } from "../components/molecules/sidebar/navItems";
import { filterNavItemsByRole, roleAllows, ROLE_VISIBLE_PATHS } from "../constants/rolePermissions";

describe("sidebar: Impresoras", () => {
  it("declara la entrada /impresoras solo para ADMIN y MANAGEMENT", () => {
    const item = navItems.find((i) => i.to === "/impresoras");
    expect(item?.label).toBe("Impresoras");
    expect(item?.visibleRoles).toEqual(["ADMIN", "MANAGEMENT"]);
  });

  it("filterNavItemsByRole la muestra solo a ADMIN/MANAGEMENT", () => {
    const visible = (role: string) =>
      filterNavItemsByRole(navItems, role).some((i) => i.to === "/impresoras");
    expect(visible("ADMIN")).toBe(true);
    expect(visible("MANAGEMENT")).toBe(true);
    for (const role of ["VENDEDOR", "CASHIER", "EMPLOYEE"]) expect(visible(role)).toBe(false);
  });

  it("ROLE_VISIBLE_PATHS/roleAllows restringen la ruta", () => {
    expect(ROLE_VISIBLE_PATHS["/impresoras"]).toEqual(["ADMIN", "MANAGEMENT"]);
    expect(roleAllows("VENDEDOR", "/impresoras")).toBe(false);
    expect(roleAllows("ADMIN", "/impresoras")).toBe(true);
  });
});

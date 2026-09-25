import { describe, it, expect } from "vitest";
import { navGroups, navItems } from "../components/molecules/sidebar/navItems";
import {
  filterNavItemsByRole,
  roleAllows,
  ROLE_VISIBLE_PATHS,
} from "../constants/rolePermissions";

// Entrada de sidebar + ruta "/carga-manual": solo ADMIN/MANAGEMENT, dentro del
// grupo "Productos" pegada a "Categorías".
describe("sidebar: Carga manual", () => {
  const productos = navGroups.find((g) => g.label === "Productos")!;

  it("vive en el grupo Productos justo después de Categorías", () => {
    const paths = productos.items.map((i) => i.to);
    expect(paths).toContain("/carga-manual");
    expect(paths.indexOf("/carga-manual")).toBe(paths.indexOf("/categorias") + 1);
  });

  it("declara visibleRoles ADMIN y MANAGEMENT", () => {
    const item = navItems.find((i) => i.to === "/carga-manual");
    expect(item?.label).toBe("Carga manual");
    expect(item?.visibleRoles).toEqual(["ADMIN", "MANAGEMENT"]);
  });

  it("filterNavItemsByRole la muestra a ADMIN/MANAGEMENT y la oculta al resto", () => {
    const visible = (role: string) =>
      filterNavItemsByRole(navItems, role).some((i) => i.to === "/carga-manual");
    expect(visible("ADMIN")).toBe(true);
    expect(visible("MANAGEMENT")).toBe(true);
    for (const role of ["VENDEDOR", "CASHIER", "EMPLOYEE", "SUPERADMIN"]) {
      expect(visible(role)).toBe(false);
    }
  });

  it("ROLE_VISIBLE_PATHS/roleAllows restringen /carga-manual a ADMIN y MANAGEMENT", () => {
    expect(ROLE_VISIBLE_PATHS["/carga-manual"]).toEqual(["ADMIN", "MANAGEMENT"]);
    expect(roleAllows("ADMIN", "/carga-manual")).toBe(true);
    expect(roleAllows("MANAGEMENT", "/carga-manual")).toBe(true);
    expect(roleAllows("VENDEDOR", "/carga-manual")).toBe(false);
  });
});

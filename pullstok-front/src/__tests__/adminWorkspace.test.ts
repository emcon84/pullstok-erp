import { describe, it, expect } from "vitest";
import {
  ADMIN_WORKSPACE_AREAS,
  buildAdminNavGroups,
  filterAdminWorkspace,
  isItemAvailable,
} from "../constants/adminWorkspace";
import { MODULE_REGISTRY } from "../constants/planLimits";

const ALL = ["stock", "clientes", "proveedores", "contabilidad", "facturacion", "branding"];
const keysOf = (areas: ReturnType<typeof filterAdminWorkspace>) =>
  areas.flatMap((a) => a.items.map((i) => i.key));

describe("ADMIN_WORKSPACE_AREAS (config)", () => {
  it("define Comercial, Tesorería y Contabilidad en ese orden", () => {
    expect(ADMIN_WORKSPACE_AREAS.map((a) => a.label)).toEqual([
      "Comercial",
      "Tesorería",
      "Contabilidad",
    ]);
  });

  it("todo moduleKey existe en MODULE_REGISTRY (guard de sync)", () => {
    const registry = new Set(MODULE_REGISTRY.map((m) => m.key));
    for (const item of ADMIN_WORKSPACE_AREAS.flatMap((a) => a.items)) {
      if (item.moduleKey) expect(registry.has(item.moduleKey)).toBe(true);
    }
  });

  it("un ítem disponible siempre tiene ruta; solo Plan de cuentas está disponible en contabilidad", () => {
    for (const item of ADMIN_WORKSPACE_AREAS.flatMap((a) => a.items)) {
      if (item.available) expect(item.route).toBeTruthy();
    }
    const conta = ADMIN_WORKSPACE_AREAS.find((a) => a.key === "contabilidad")!;
    expect(conta.items.filter(isItemAvailable).map((i) => i.key)).toEqual(["plan-cuentas"]);
    const plan = conta.items.find((i) => i.key === "plan-cuentas")!;
    expect(plan.route).toBe("/contabilidad/plan-de-cuentas");
    expect(plan.moduleKey).toBe("contabilidad");
  });
});

describe("filterAdminWorkspace", () => {
  it("oculta ítems cuyo moduleKey no está habilitado", () => {
    const keys = keysOf(filterAdminWorkspace(ADMIN_WORKSPACE_AREAS, ["stock"], "ADMIN"));
    expect(keys).toContain("stock");
    expect(keys).not.toContain("clientes");
    expect(keys).not.toContain("proveedores");
    expect(keys).not.toContain("facturacion");
  });

  it("conserva los ítems no disponibles (se muestran como Próximamente)", () => {
    const keys = keysOf(filterAdminWorkspace(ADMIN_WORKSPACE_AREAS, ALL, "ADMIN"));
    expect(keys).toEqual(expect.arrayContaining(["compras", "bancos", "asientos"]));
  });

  it("aplica rolePermissions encima del módulo (VENDEDOR no ve Proveedores)", () => {
    const keys = keysOf(filterAdminWorkspace(ADMIN_WORKSPACE_AREAS, ALL, "VENDEDOR"));
    expect(keys).not.toContain("proveedores");
    expect(keys).not.toContain("facturacion");
    expect(keys).toContain("clientes");
    expect(keys).toContain("caja");
  });

  it("descarta áreas que quedan vacías", () => {
    const areas = [
      { ...ADMIN_WORKSPACE_AREAS[0], items: ADMIN_WORKSPACE_AREAS[0].items.filter((i) => i.moduleKey === "proveedores") },
    ];
    expect(filterAdminWorkspace(areas, [], "ADMIN")).toEqual([]);
  });
});

describe("buildAdminNavGroups (sidebar)", () => {
  const flatTo = (groups: ReturnType<typeof buildAdminNavGroups>) =>
    groups.flatMap((g) => g.items.map((i) => i.to));

  it("arma Inicio + áreas + Configuración, solo con ítems disponibles", () => {
    const groups = buildAdminNavGroups(ALL, "ADMIN");
    expect(groups.map((g) => g.label)).toEqual([
      "Inicio",
      "Comercial",
      "Tesorería",
      "Contabilidad",
      "Configuración",
    ]);
    const labels = groups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("Compras");
    expect(labels).not.toContain("Bancos");
    expect(flatTo(groups)).toEqual(
      expect.arrayContaining(["/Ventas", "/Clientes", "/Proveedores", "/stock", "/caja", "/contabilidad/plan-de-cuentas", "/usuarios", "/ajustes/modulos"]),
    );
  });

  it("nunca incluye entradas de POS / tienda / bot / precio por kilo", () => {
    const to = flatTo(buildAdminNavGroups([...ALL, "suelto", "bot", "tienda"], "ADMIN"));
    for (const forbidden of ["/scanner", "/consultar-precios", "/precios-por-kilo", "/tienda", "/asistente-ia", "/pedidos", "/presupuestos"]) {
      expect(to).not.toContain(forbidden);
    }
  });

  it("respeta módulos y roles (Ajustes solo ADMIN; Proveedores requiere módulo)", () => {
    const mgmt = flatTo(buildAdminNavGroups(["clientes"], "MANAGEMENT"));
    expect(mgmt).toContain("/usuarios");
    expect(mgmt).not.toContain("/ajustes");
    expect(mgmt).not.toContain("/Proveedores");
  });
});

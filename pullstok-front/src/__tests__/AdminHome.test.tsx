import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../contexts/OrgModulesContext", () => ({
  useOrgModulesContext: vi.fn(),
}));

vi.mock("@/components/organisms/VendorChat", () => ({
  VendorChatWidget: () => <div data-testid="vendor-chat-widget" />,
}));

import { AdminHome } from "../views/AdminHome";
import { useOrgModulesContext } from "../contexts/OrgModulesContext";

const setModules = (enabledModules: string[]) =>
  vi.mocked(useOrgModulesContext).mockReturnValue({
    enabledModules,
    plan: "PRO",
    hasPriceKg: false,
  } as any);

const renderHome = () =>
  render(
    <MemoryRouter>
      <AdminHome />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.setItem("user", JSON.stringify({ role: "ADMIN" }));
  setModules(["stock", "clientes", "proveedores", "contabilidad", "facturacion"]);
});

describe("AdminHome", () => {
  it("renderiza las áreas como encabezados", () => {
    renderHome();
    for (const name of ["Comercial", "Tesorería", "Contabilidad"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("los ítems disponibles son links a su ruta", () => {
    renderHome();
    expect(screen.getByRole("link", { name: /Clientes/ })).toHaveAttribute("href", "/Clientes");
    expect(screen.getByRole("link", { name: /Proveedores/ })).toHaveAttribute("href", "/Proveedores");
    expect(screen.getByRole("link", { name: /Stock/ })).toHaveAttribute("href", "/stock");
    expect(screen.getByRole("link", { name: /Plan de cuentas/ })).toHaveAttribute(
      "href",
      "/contabilidad/plan-de-cuentas",
    );
  });

  it("los no disponibles se ven deshabilitados con 'Próximamente' y sin link", () => {
    renderHome();
    expect(screen.getAllByText("Próximamente").length).toBeGreaterThanOrEqual(8);
    const bancos = screen.getByText("Bancos").closest("[data-slot='card']") as HTMLElement;
    expect(bancos).toHaveAttribute("aria-disabled", "true");
    expect(within(bancos).getByText("Próximamente")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Bancos/ })).not.toBeInTheDocument();
  });

  it("no renderiza el chat flotante de ventas (VendorChatWidget)", () => {
    renderHome();
    expect(screen.queryByTestId("vendor-chat-widget")).not.toBeInTheDocument();
  });

  it("oculta los ítems cuyo módulo no está habilitado", () => {
    setModules(["stock"]);
    renderHome();
    expect(screen.queryByText("Proveedores")).not.toBeInTheDocument();
    expect(screen.queryByText("Clientes")).not.toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();
  });
});

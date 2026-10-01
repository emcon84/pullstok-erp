import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../components/hooks/useOrder", () => ({
  usePendingOrdersCount: () => ({ count: 0 }),
}));
vi.mock("../components/hooks/useChat", () => ({
  useUnreadMessagesCount: () => ({ count: 0 }),
}));
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("@/contexts/BrandingContext", () => ({
  useBrandingContext: () => ({ branding: { displayName: "Demo", showDisplayName: true } }),
}));
vi.mock("@/contexts/OrgModulesContext", () => ({
  useOrgModulesContext: vi.fn(),
}));
vi.mock("@/components/atoms/BrandLogo", () => ({ BrandLogo: () => null }));
vi.mock("@/components/atoms/InstallButton", () => ({ InstallButton: () => null }));
vi.mock("@/components/atoms/RefreshDataButton", () => ({ RefreshDataButton: () => null }));
vi.mock("../controllers/authController", () => ({ logout: vi.fn() }));

import { SidebarContent } from "../components/molecules/sidebar";
import { useOrgModulesContext } from "@/contexts/OrgModulesContext";

const MODULES = ["stock", "clientes", "proveedores", "facturacion", "suelto", "bot", "tienda"];

const renderSidebar = (uiMode: "OPERATIVO" | "ADMINISTRATIVO") => {
  vi.mocked(useOrgModulesContext).mockReturnValue({
    enabledModules: MODULES,
    plan: "PREMIUM",
    hasPriceKg: true,
    uiMode,
  } as any);
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <SidebarContent />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  localStorage.setItem("user", JSON.stringify({ role: "ADMIN", name: "Ana" }));
});

describe("Sidebar según uiMode", () => {
  it("ADMINISTRATIVO: grupos por área, sin entradas de POS/tienda/bot", () => {
    renderSidebar("ADMINISTRATIVO");
    for (const g of ["Comercial", "Tesorería", "Configuración"]) {
      expect(screen.getByText(g)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("href", "/dashboard");
    // Los grupos están colapsados salvo el activo, pero los links siguen en el DOM.
    expect(screen.getByRole("link", { name: "Clientes" })).toBeInTheDocument();
    for (const hidden of ["Scanner", "Venta suelta", "Precios por kilo", "Asistente IA", "Pedidos", "Presupuestos", "Productos", "Tienda"]) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
    expect(screen.queryByText("Bancos")).not.toBeInTheDocument();
  });

  it("OPERATIVO: conserva el menú de siempre (POS incluido)", () => {
    renderSidebar("OPERATIVO");
    expect(screen.getByText("Productos")).toBeInTheDocument();
    expect(screen.getByText("Scanner")).toBeInTheDocument();
    expect(screen.getByText("Venta suelta")).toBeInTheDocument();
    expect(screen.getByText("Asistente IA")).toBeInTheDocument();
    expect(screen.queryByText("Tesorería")).not.toBeInTheDocument();
  });
});

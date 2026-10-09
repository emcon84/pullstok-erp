import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../components/hooks/useAccounts", () => ({
  useAccounts: vi.fn(),
  useCreateAccount: vi.fn(),
  useUpdateAccount: vi.fn(),
  useDeleteAccount: vi.fn(),
  useSeedDefaultAccounts: vi.fn(),
  useImportAccounts: vi.fn(),
}));

import { ChartOfAccounts } from "../views/ChartOfAccounts";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useSeedDefaultAccounts,
  useImportAccounts,
} from "../components/hooks/useAccounts";

const submitAccount = vi.fn();
const updateAccount = vi.fn();
const deleteAccount = vi.fn();
const seedAccounts = vi.fn();

const acc = (id: string, code: string, name: string, parentId: string | null, isPostable: boolean) => ({
  id, code, name, parentId, isPostable, type: "ASSET" as const, isActive: true,
});

const ACCOUNTS = [
  acc("1", "1", "ACTIVO", null, false),
  acc("11", "1.1", "Caja y Bancos", "1", false),
  acc("111", "1.1.01", "Caja", "11", true),
  acc("112", "1.1.02", "Banco cuenta corriente", "11", true),
];

const mockAccounts = (accounts: any[]) =>
  vi.mocked(useAccounts).mockReturnValue({
    accounts,
    loadingAccounts: false,
    errorAccounts: null,
  } as any);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("user", JSON.stringify({ role: "ADMIN" }));
  mockAccounts(ACCOUNTS);
  vi.mocked(useCreateAccount).mockReturnValue({ submitAccount, loadingCreate: false } as any);
  vi.mocked(useUpdateAccount).mockReturnValue({ updateAccount, loadingUpdate: false } as any);
  vi.mocked(useDeleteAccount).mockReturnValue({ deleteAccount, loadingDelete: false } as any);
  vi.mocked(useSeedDefaultAccounts).mockReturnValue({ seedAccounts, loadingSeed: false } as any);
  vi.mocked(useImportAccounts).mockReturnValue({ importAccounts: vi.fn(), loadingImport: false } as any);
});

describe("ChartOfAccounts view", () => {
  it("muestra 'Importar desde GFLOW' solo al ADMIN", () => {
    const { unmount } = render(<ChartOfAccounts />);
    expect(screen.getByRole("button", { name: /Importar desde GFLOW/ })).toBeInTheDocument();
    unmount();
    localStorage.setItem("user", JSON.stringify({ role: "MANAGEMENT" }));
    render(<ChartOfAccounts />);
    expect(screen.queryByRole("button", { name: /Importar desde GFLOW/ })).not.toBeInTheDocument();
  });

  it("muestra el conteo y el árbol con los rubros raíz abiertos", () => {
    render(<ChartOfAccounts />);
    expect(screen.getByText("4 cuentas registradas")).toBeInTheDocument();
    expect(screen.getByText("ACTIVO")).toBeInTheDocument();
    expect(screen.getByText("Caja y Bancos")).toBeInTheDocument();
    // Nivel 3 colapsado por defecto.
    expect(screen.queryByText("Caja")).not.toBeInTheDocument();
  });

  it("expande y contrae con el chevron y con los botones globales", () => {
    render(<ChartOfAccounts />);
    fireEvent.click(screen.getByRole("button", { name: "Expandir Caja y Bancos" }));
    expect(screen.getByText("Caja")).toBeInTheDocument();
    expect(screen.getAllByText("Imputable")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Contraer ACTIVO" }));
    expect(screen.queryByText("Caja y Bancos")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Expandir todo/ }));
    expect(screen.getByText("Banco cuenta corriente")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Colapsar todo/ }));
    expect(screen.queryByText("Caja y Bancos")).not.toBeInTheDocument();
  });

  it("la búsqueda muestra la coincidencia con sus ancestros expandidos", () => {
    render(<ChartOfAccounts />);
    fireEvent.change(screen.getByLabelText("Buscar cuentas"), { target: { value: "1.1.02" } });
    expect(screen.getByText("Banco cuenta corriente")).toBeInTheDocument();
    expect(screen.getByText("Caja y Bancos")).toBeInTheDocument();
    expect(screen.getByText("ACTIVO")).toBeInTheDocument();
    expect(screen.queryByText("Caja")).not.toBeInTheDocument();
  });

  it("las imputables no ofrecen agregar subcuenta", () => {
    render(<ChartOfAccounts />);
    fireEvent.click(screen.getByRole("button", { name: /Expandir todo/ }));
    expect(screen.getByRole("button", { name: "Agregar subcuenta a Caja y Bancos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar subcuenta a Caja" })).not.toBeInTheDocument();
  });

  it("eliminar pide confirmación", () => {
    render(<ChartOfAccounts />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Caja y Bancos" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    expect(deleteAccount).toHaveBeenCalledWith("11", expect.any(Object));
  });

  it("sin cuentas muestra el estado vacío con 'Cargar plan base'", () => {
    mockAccounts([]);
    render(<ChartOfAccounts />);
    expect(screen.getByText("Todavía no hay plan de cuentas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cargar plan base" }));
    expect(seedAccounts).toHaveBeenCalledTimes(1);
  });

  it("un rol sin permiso de escritura no ve acciones de alta/edición", () => {
    localStorage.setItem("user", JSON.stringify({ role: "VENDEDOR" }));
    render(<ChartOfAccounts />);
    expect(screen.queryByRole("button", { name: "Agregar cuenta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar ACTIVO" })).not.toBeInTheDocument();
  });

  it("el alta exige código y nombre y los envía", () => {
    render(<ChartOfAccounts />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar cuenta" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(submitAccount).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Otro rubro" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(submitAccount).toHaveBeenCalledTimes(1);
    const payload = submitAccount.mock.calls[0][0];
    expect(payload).toMatchObject({ code: "6", name: "Otro rubro", type: "ASSET", isPostable: false });
    expect(payload.parentId).toBeUndefined();
  });
});

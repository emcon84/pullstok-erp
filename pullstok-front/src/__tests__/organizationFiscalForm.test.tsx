import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Hoisted mocks — vitest lifts these above all static imports so the module
// graph sees the mock before any consumer module is evaluated.
// ---------------------------------------------------------------------------
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../services/onboardingService", () => ({
  updateOrganization: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Static imports (after mock registration)
// ---------------------------------------------------------------------------
import { updateOrganization } from "../services/onboardingService";
import { OrganizationFiscalForm } from "../components/molecules/OrganizationFiscalForm";
import type { Organization } from "../services/onboardingService";

const baseOrg: Organization = {
  id: "org-1",
  name: "Ferretería Don José",
  address: "Av. Siempreviva 742",
  taxId: "20-12345678-9",
  taxCondition: "IVA Responsable Inscripto",
  ingresosBrutos: "20-12345678-9",
  inicioActividades: "01/01/2000",
  onboardingCompletedAt: null,
};

describe("OrganizationFiscalForm", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  };

  it("renders the fiscal data fields pre-filled from the organization", () => {
    renderWithProviders(<OrganizationFiscalForm organization={baseOrg} />);

    expect(screen.getByLabelText(/razón social/i)).toHaveValue(
      "Ferretería Don José",
    );
    expect(screen.getByLabelText(/cuit/i)).toHaveValue("20-12345678-9");
    expect(screen.getByLabelText(/condición de iva/i)).toHaveValue(
      "IVA Responsable Inscripto",
    );
    expect(screen.getByLabelText(/dirección/i)).toHaveValue(
      "Av. Siempreviva 742",
    );
    expect(screen.getByLabelText(/ingresos brutos/i)).toHaveValue(
      "20-12345678-9",
    );
    expect(screen.getByLabelText(/inicio de actividades/i)).toHaveValue(
      "01/01/2000",
    );
  });

  it("renders empty fields when the organization has no fiscal data", () => {
    renderWithProviders(<OrganizationFiscalForm />);

    expect(screen.getByLabelText(/razón social/i)).toHaveValue("");
    expect(screen.getByLabelText(/cuit/i)).toHaveValue("");
    expect(screen.getByLabelText(/condición de iva/i)).toHaveValue("");
    expect(screen.getByLabelText(/dirección/i)).toHaveValue("");
    expect(screen.getByLabelText(/ingresos brutos/i)).toHaveValue("");
    expect(screen.getByLabelText(/inicio de actividades/i)).toHaveValue("");
  });

  it("calls updateOrganization with the form values on submit", async () => {
    vi.mocked(updateOrganization).mockResolvedValue({ ...baseOrg });
    renderWithProviders(<OrganizationFiscalForm organization={baseOrg} />);

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(updateOrganization).toHaveBeenCalledWith({
        name: "Ferretería Don José",
        taxId: "20-12345678-9",
        taxCondition: "IVA Responsable Inscripto",
        address: "Av. Siempreviva 742",
        ingresosBrutos: "20-12345678-9",
        inicioActividades: "01/01/2000",
      });
    });
  });

  it("shows the submit button disabled while saving", async () => {
    vi.mocked(updateOrganization).mockImplementation(
      () => new Promise(() => {}),
    );
    renderWithProviders(<OrganizationFiscalForm organization={baseOrg} />);

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    expect(
      await screen.findByRole("button", { name: /guardando/i }),
    ).toBeDisabled();
  });
});
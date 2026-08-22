import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Hoisted mocks — se levantan antes de los imports estáticos.
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../services/arcaService", () => ({
  getArcaSettings: vi.fn(),
  updateArcaSettings: vi.fn(),
}));

import { getArcaSettings, updateArcaSettings } from "../services/arcaService";
import { ArcaSettingsForm } from "../components/molecules/ArcaSettingsForm";

const baseSettings = {
  cuitEmisor: "30-70970670-1",
  padronCuit: null,
  puntoVenta: 2,
  environment: "HOMOLOGACION" as const,
  certPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.crt",
  keyPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.key",
  enabled: true,
};

describe("ArcaSettingsForm (deuda técnica item 6)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getArcaSettings).mockResolvedValue(baseSettings);
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  };

  it("pre-carga los campos desde getArcaSettings", async () => {
    renderWithProviders(<ArcaSettingsForm />);

    expect(await screen.findByLabelText(/cuit del emisor/i)).toHaveValue(
      "30-70970670-1",
    );
    expect(screen.getByLabelText(/punto de venta/i)).toHaveValue(2);
    expect(screen.getByLabelText(/ruta del certificado/i)).toHaveValue(
      baseSettings.certPath,
    );
    expect(screen.getByLabelText(/habilitar facturación electrónica/i)).toBeChecked();
  });

  it("guarda con updateArcaSettings al hacer click en Guardar", async () => {
    vi.mocked(updateArcaSettings).mockResolvedValue(baseSettings);
    renderWithProviders(<ArcaSettingsForm />);

    fireEvent.click(
      await screen.findByRole("button", { name: /guardar configuración/i }),
    );

    await waitFor(() => {
      expect(updateArcaSettings).toHaveBeenCalledTimes(1);
      const arg = vi.mocked(updateArcaSettings).mock.calls[0][0];
      expect(arg).toMatchObject({
        cuitEmisor: "30-70970670-1",
        puntoVenta: 2,
        environment: "HOMOLOGACION",
        enabled: true,
      });
    });
  });

  it("permite cambiar el ambiente a Producción", async () => {
    renderWithProviders(<ArcaSettingsForm />);

    const select = (await screen.findByLabelText(/ambiente/i)) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "PRODUCCION" } });

    expect(select.value).toBe("PRODUCCION");
  });
});

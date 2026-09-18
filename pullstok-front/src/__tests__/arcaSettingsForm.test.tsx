import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Hoisted mocks — se levantan antes de los imports estáticos.
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../services/arcaService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/arcaService")>();
  return {
    ...actual,
    getArcaSettings: vi.fn(),
    updateArcaSettings: vi.fn(),
    getArcaCertificates: vi.fn(),
    uploadArcaCertificate: vi.fn(),
    verifyArcaService: vi.fn(),
  };
});

import {
  getArcaSettings,
  updateArcaSettings,
  getArcaCertificates,
  uploadArcaCertificate,
  verifyArcaService,
  ArcaVerifyCooldownError,
} from "../services/arcaService";
import { ArcaSettingsForm } from "../components/molecules/ArcaSettingsForm";

const baseSettings = {
  cuitEmisor: "30-70970670-1",
  padronCuit: null,
  puntoVenta: 2,
  environment: "HOMOLOGACION" as const,
  certPath: "",
  keyPath: "",
  enabled: true,
};

const homoCert = {
  environment: "HOMOLOGACION" as const,
  subjectCn: "pullstoktest",
  subjectCuit: "20274225964",
  issuer: "AFIP",
  validFrom: "2026-08-19T00:00:00.000Z",
  validTo: "2028-08-18T00:00:00.000Z",
  isExpired: false,
  uploadedAt: "2026-08-19T00:00:00.000Z",
  uploadedByUserId: "user-1",
};

const baseCertificates = { HOMOLOGACION: homoCert, PRODUCCION: null };

describe("ArcaSettingsForm", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getArcaSettings).mockResolvedValue(baseSettings);
    vi.mocked(getArcaCertificates).mockResolvedValue(baseCertificates);
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
    expect(screen.getByLabelText(/habilitar facturación electrónica/i)).toBeChecked();
  });

  it("no muestra más los inputs de ruta de certificado (deprecated)", async () => {
    renderWithProviders(<ArcaSettingsForm />);
    await screen.findByLabelText(/cuit del emisor/i);

    expect(screen.queryByLabelText(/ruta del certificado/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ruta de la clave/i)).not.toBeInTheDocument();
  });

  it("guarda con updateArcaSettings al hacer click en Guardar (sin certPath/keyPath)", async () => {
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
      expect(arg).not.toHaveProperty("certPath");
      expect(arg).not.toHaveProperty("keyPath");
    });
  });

  it("deshabilita en el selector el ambiente sin certificado cargado", async () => {
    renderWithProviders(<ArcaSettingsForm />);

    const select = (await screen.findByLabelText(/ambiente/i)) as HTMLSelectElement;
    await waitFor(() => {
      const prodOption = Array.from(select.options).find((o) => o.value === "PRODUCCION")!;
      expect(prodOption.disabled).toBe(true);
      const homoOption = Array.from(select.options).find((o) => o.value === "HOMOLOGACION")!;
      expect(homoOption.disabled).toBe(false);
    });
  });

  it("muestra la metadata del certificado cargado (sin exponer la clave)", async () => {
    renderWithProviders(<ArcaSettingsForm />);

    expect(await screen.findByText(/pullstoktest/i)).toBeInTheDocument();
    expect(screen.getByText(/cuit 20274225964/i)).toBeInTheDocument();
  });

  it("sube el par cert+key de un ambiente", async () => {
    vi.mocked(uploadArcaCertificate).mockResolvedValue({
      ...homoCert,
      environment: "PRODUCCION",
    });
    renderWithProviders(<ArcaSettingsForm />);
    await screen.findByLabelText(/cuit del emisor/i);

    const certInput = screen.getByLabelText(/certificado \(\.crt\)/i, {
      selector: "#arcaCert-PRODUCCION",
    }) as HTMLInputElement;
    const keyInput = screen.getByLabelText(/clave privada \(\.key\)/i, {
      selector: "#arcaKey-PRODUCCION",
    }) as HTMLInputElement;

    const certFile = new File(["cert"], "prod.crt", { type: "application/x-x509-ca-cert" });
    const keyFile = new File(["key"], "prod.key", { type: "application/octet-stream" });
    fireEvent.change(certInput, { target: { files: [certFile] } });
    fireEvent.change(keyInput, { target: { files: [keyFile] } });

    fireEvent.click(screen.getByRole("button", { name: /subir certificado de producción/i }));

    await waitFor(() => {
      expect(uploadArcaCertificate).toHaveBeenCalledWith("PRODUCCION", certFile, keyFile);
    });
  });

  it("verifica un servicio y muestra el resultado", async () => {
    vi.mocked(verifyArcaService).mockResolvedValue({
      status: "habilitado",
      message: "El servicio está habilitado para este ambiente.",
      checkedAt: "2026-09-18T00:00:00.000Z",
    });
    renderWithProviders(<ArcaSettingsForm />);
    await screen.findByLabelText(/cuit del emisor/i);

    fireEvent.click(screen.getAllByRole("button", { name: /^verificar$/i })[0]);

    await waitFor(() => {
      expect(verifyArcaService).toHaveBeenCalledWith("wsfe");
      expect(screen.getByText(/está habilitado para este ambiente/i)).toBeInTheDocument();
    });
  });

  it("ante un 429 (cooldown) deshabilita el botón y muestra el tiempo restante", async () => {
    vi.mocked(verifyArcaService).mockRejectedValue(
      new ArcaVerifyCooldownError("Ya se verificó este servicio hace poco.", 120),
    );
    renderWithProviders(<ArcaSettingsForm />);
    await screen.findByLabelText(/cuit del emisor/i);

    const verifyButtons = screen.getAllByRole("button", { name: /^verificar$/i });
    fireEvent.click(verifyButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reintentar en \d+s/i })).toBeDisabled();
    });
  });
});

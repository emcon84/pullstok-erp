import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/utils/directPrintAgent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/directPrintAgent")>();
  return {
    ...actual,
    getAgentHealth: vi.fn(),
    getAgentPrinters: vi.fn(),
    setAgentPrinter: vi.fn(),
    printAgentTest: vi.fn(),
    isAgentEnabled: vi.fn(),
    setAgentEnabled: vi.fn(),
  };
});

import { toast } from "react-toastify";
import {
  DirectPrintAgentError,
  getAgentHealth,
  getAgentPrinters,
  isAgentEnabled,
  printAgentTest,
  setAgentEnabled,
  setAgentPrinter,
} from "@/utils/directPrintAgent";
import { DirectPrintSettings } from "@/components/molecules/DirectPrintSettings";

const health = (printer: string | null = null) => ({
  name: "pullstok-print-agent",
  version: "1.2.3",
  printer,
  platform: "win32",
});

describe("DirectPrintSettings — Impresión directa de tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAgentEnabled).mockReturnValue(false);
    vi.mocked(getAgentPrinters).mockResolvedValue(["OCOM 58", "PDF"]);
  });

  it("agente no detectado: muestra el estado, el instalador y los pasos", async () => {
    vi.mocked(getAgentHealth).mockRejectedValue(new DirectPrintAgentError("caído"));
    render(<DirectPrintSettings />);

    expect(await screen.findByText(/no detectado/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /descargar instalador/i });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/emcon84/pullstok-erp/releases/latest/download/PullstokPrint-Setup.exe",
    );
    expect(screen.getByText(/más información/i)).toBeInTheDocument();
    expect(screen.getByText(/ejecutar de todas formas/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/impresora/i)).not.toBeInTheDocument();
  });

  it("'Reintentar' vuelve a consultar /health y pasa a Conectado", async () => {
    vi.mocked(getAgentHealth).mockRejectedValueOnce(new DirectPrintAgentError("caído"));
    vi.mocked(getAgentHealth).mockResolvedValue(health());
    render(<DirectPrintSettings />);
    await screen.findByText(/no detectado/i);

    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(await screen.findByText(/conectado v1\.2\.3/i)).toBeInTheDocument();
    expect(getAgentHealth).toHaveBeenCalledTimes(2);
  });

  it("conectado: lista las impresoras y marca la actual", async () => {
    vi.mocked(getAgentHealth).mockResolvedValue(health("OCOM 58"));
    render(<DirectPrintSettings />);

    const select = (await screen.findByLabelText(/impresora/i)) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("OCOM 58"));
    expect(Array.from(select.options).map((o) => o.value)).toEqual(
      expect.arrayContaining(["OCOM 58", "PDF"]),
    );
  });

  it("elegir impresora: PUT /config, activa la impresión directa y avisa", async () => {
    vi.mocked(getAgentHealth).mockResolvedValue(health(null));
    vi.mocked(setAgentPrinter).mockResolvedValue(undefined);
    render(<DirectPrintSettings />);

    const select = await screen.findByLabelText(/impresora/i);
    await waitFor(() => expect(screen.getByRole("option", { name: "OCOM 58" })).toBeInTheDocument());
    fireEvent.change(select, { target: { value: "OCOM 58" } });

    await waitFor(() => expect(setAgentPrinter).toHaveBeenCalledWith("OCOM 58"));
    await waitFor(() => expect(setAgentEnabled).toHaveBeenCalledWith(true));
    expect(toast.success).toHaveBeenCalled();
  });

  it("error al elegir impresora: toast con el message del agente y NO activa", async () => {
    vi.mocked(getAgentHealth).mockResolvedValue(health(null));
    vi.mocked(setAgentPrinter).mockRejectedValue(
      new DirectPrintAgentError("La impresora no existe", 400),
    );
    render(<DirectPrintSettings />);

    const select = await screen.findByLabelText(/impresora/i);
    await waitFor(() => expect(screen.getByRole("option", { name: "PDF" })).toBeInTheDocument());
    fireEvent.change(select, { target: { value: "PDF" } });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("La impresora no existe"));
    expect(setAgentEnabled).not.toHaveBeenCalled();
  });

  it("'Imprimir prueba' llama a /test; si falla muestra el message", async () => {
    vi.mocked(getAgentHealth).mockResolvedValue(health("OCOM 58"));
    vi.mocked(printAgentTest).mockResolvedValueOnce(undefined);
    render(<DirectPrintSettings />);

    fireEvent.click(await screen.findByRole("button", { name: /imprimir prueba/i }));
    await waitFor(() => expect(printAgentTest).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalled();

    vi.mocked(printAgentTest).mockRejectedValueOnce(
      new DirectPrintAgentError("No hay impresora configurada", 409),
    );
    fireEvent.click(screen.getByRole("button", { name: /imprimir prueba/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No hay impresora configurada"),
    );
  });

  it("'Desactivar impresión directa' apaga el flag de esta PC", async () => {
    vi.mocked(isAgentEnabled).mockReturnValue(true);
    vi.mocked(getAgentHealth).mockResolvedValue(health("OCOM 58"));
    render(<DirectPrintSettings />);

    fireEvent.click(await screen.findByRole("button", { name: /desactivar impresión directa/i }));

    expect(setAgentEnabled).toHaveBeenCalledWith(false);
    expect(
      await screen.findByRole("button", { name: /activar impresión directa/i }),
    ).toBeInTheDocument();
  });
});

describe("DirectPrintSettings — actualización del agente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAgentEnabled).mockReturnValue(false);
    vi.mocked(getAgentPrinters).mockResolvedValue(["OCOM 58"]);
  });

  const INSTALLER =
    "https://github.com/emcon84/pullstok-erp/releases/latest/download/PullstokPrint-Setup.exe";

  it("agente conectado con versión vieja: avisa y ofrece descargar el instalador", async () => {
    vi.mocked(getAgentHealth).mockResolvedValue({ ...health("OCOM 58"), version: "1.0.0" });
    render(<DirectPrintSettings />);

    expect(await screen.findByText(/hay una versión nueva/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /descargar instalador/i })).toHaveAttribute(
      "href",
      INSTALLER,
    );
  });

  it("agente con la versión actual o más nueva: no muestra el aviso", async () => {
    vi.mocked(getAgentHealth).mockResolvedValue({ ...health("OCOM 58"), version: "1.1.0" });
    render(<DirectPrintSettings />);

    await screen.findByText(/conectado v1\.1\.0/i);
    expect(screen.queryByText(/hay una versión nueva/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /descargar instalador/i })).not.toBeInTheDocument();
  });

  it("compara versiones numéricamente (1.10.0 es más nueva que 1.2.0)", async () => {
    vi.mocked(getAgentHealth).mockResolvedValue({ ...health("OCOM 58"), version: "1.10.0" });
    render(<DirectPrintSettings />);

    await screen.findByText(/conectado v1\.10\.0/i);
    expect(screen.queryByText(/hay una versión nueva/i)).not.toBeInTheDocument();
  });
});

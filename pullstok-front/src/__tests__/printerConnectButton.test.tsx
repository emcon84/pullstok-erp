import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/utils/serialPrinter", () => ({
  isSerialPrintingSupported: vi.fn(),
  getConnectedPrinterPort: vi.fn(),
  connectPrinter: vi.fn(),
  disconnectPrinter: vi.fn(),
  printBytes: vi.fn(),
  getPrinterBaudRate: vi.fn(),
  setPrinterBaudRate: vi.fn(),
  probePrinterBaudRates: vi.fn(),
  SUPPORTED_BAUD_RATES: [9600, 19200, 38400, 57600, 115200],
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { PrinterConnectButton } from "@/components/molecules/PrinterConnectButton";
import {
  isSerialPrintingSupported,
  getConnectedPrinterPort,
  connectPrinter,
  disconnectPrinter,
  printBytes,
  getPrinterBaudRate,
  setPrinterBaudRate,
  probePrinterBaudRates,
} from "@/utils/serialPrinter";
import { encodeTestTicketEscPos } from "@/utils/escpos";
import { toast } from "react-toastify";

function setup({ supported = true, port = false, baud = 9600 } = {}) {
  vi.mocked(isSerialPrintingSupported).mockReturnValue(supported);
  vi.mocked(getPrinterBaudRate).mockReturnValue(baud);
  vi.mocked(getConnectedPrinterPort).mockResolvedValue(port ? ({ fake: true } as never) : null);
  return render(<PrinterConnectButton />);
}

describe("PrinterConnectButton", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("navegador sin Web Serial: deshabilitado y con explicación", () => {
    setup({ supported: false });
    const btn = screen.getByRole("button", { name: /conectar impresora/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Tu navegador no permite imprimir directo");
  });

  it("sin impresora conectada: 'Conectar impresora' habilitado", async () => {
    setup();
    const btn = await screen.findByRole("button", { name: /conectar impresora/i });
    expect(btn).toBeEnabled();
    await waitFor(() => expect(getConnectedPrinterPort).toHaveBeenCalled());
  });

  it("click: conecta; ok → toast de éxito y pasa a 'Impresora lista'", async () => {
    vi.mocked(connectPrinter).mockResolvedValue({ ok: true });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /conectar impresora/i }));

    expect(await screen.findByRole("button", { name: /impresora lista/i })).toBeInTheDocument();
    expect(connectPrinter).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Impresora conectada");
  });

  it("cancelar el selector no muestra nada y sigue sin conectar", async () => {
    vi.mocked(connectPrinter).mockResolvedValue({ ok: false, reason: "cancelled" });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /conectar impresora/i }));

    await waitFor(() => expect(connectPrinter).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /conectar impresora/i })).toBeInTheDocument();
  });

  it("error de conexión → toast con el motivo", async () => {
    vi.mocked(connectPrinter).mockResolvedValue({ ok: false, reason: "error", message: "puerto ocupado" });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /conectar impresora/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No se pudo conectar: puerto ocupado"),
    );
    expect(screen.getByRole("button", { name: /conectar impresora/i })).toBeInTheDocument();
  });

  it("no suelta el foco en el botón: los atajos T/escaneo siguen andando (foco vuelve al body)", async () => {
    vi.mocked(connectPrinter).mockResolvedValue({ ok: true });
    setup();
    const btn = await screen.findByRole("button", { name: /conectar impresora/i });
    btn.focus();
    expect(document.activeElement).toBe(btn);
    fireEvent.click(btn);
    await screen.findByRole("button", { name: /impresora lista/i });
    expect(document.activeElement).toBe(document.body);
  });

  it("al montar con impresora ya conectada muestra 'Impresora lista'", async () => {
    setup({ port: true });
    expect(await screen.findByRole("button", { name: /impresora lista/i })).toBeInTheDocument();
  });

  it("conectada: el menú ofrece 'Imprimir prueba' y 'Desconectar'", async () => {
    setup({ port: true });
    fireEvent.click(await screen.findByRole("button", { name: /impresora lista/i }));

    expect(screen.getByRole("menuitem", { name: /imprimir prueba/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /desconectar/i })).toBeInTheDocument();
  });

  it("'Imprimir prueba' manda el ticket de prueba y cierra el menú", async () => {
    vi.mocked(printBytes).mockResolvedValue(undefined);
    setup({ port: true });
    fireEvent.click(await screen.findByRole("button", { name: /impresora lista/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /imprimir prueba/i }));

    await waitFor(() => expect(printBytes).toHaveBeenCalledTimes(1));
    expect(Array.from(vi.mocked(printBytes).mock.calls[0][0])).toEqual(
      Array.from(encodeTestTicketEscPos()),
    );
    expect(screen.queryByRole("menuitem", { name: /desconectar/i })).not.toBeInTheDocument();
  });

  it("'Imprimir prueba' que falla → toast de error", async () => {
    vi.mocked(printBytes).mockRejectedValue(new Error("sin papel"));
    setup({ port: true });
    fireEvent.click(await screen.findByRole("button", { name: /impresora lista/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /imprimir prueba/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No se pudo imprimir la prueba (9600 baudios): sin papel",
      ),
    );
  });

  it("'Desconectar' olvida la impresora y vuelve a 'Conectar impresora'", async () => {
    vi.mocked(disconnectPrinter).mockResolvedValue(undefined);
    setup({ port: true });
    fireEvent.click(await screen.findByRole("button", { name: /impresora lista/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /desconectar/i }));

    expect(await screen.findByRole("button", { name: /conectar impresora/i })).toBeInTheDocument();
    expect(disconnectPrinter).toHaveBeenCalledTimes(1);
  });

  it("'Imprimir prueba' ok → toast de éxito con la velocidad actual", async () => {
    vi.mocked(printBytes).mockResolvedValue(undefined);
    setup({ port: true, baud: 19200 });
    fireEvent.click(await screen.findByRole("button", { name: /impresora lista/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /imprimir prueba/i }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Prueba enviada a 19200 baudios"),
    );
  });

  it("el menú muestra el select 'Velocidad' con las 5 velocidades y la guardada elegida", async () => {
    setup({ port: true, baud: 38400 });
    fireEvent.click(await screen.findByRole("button", { name: /impresora lista/i }));

    const select = screen.getByLabelText(/velocidad/i) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      "9600",
      "19200",
      "38400",
      "57600",
      "115200",
    ]);
    expect(select.value).toBe("38400");
  });

  it("cambiar la velocidad la guarda, avisa por toast y deja el foco en el body", async () => {
    setup({ port: true });
    fireEvent.click(await screen.findByRole("button", { name: /impresora lista/i }));
    const select = screen.getByLabelText(/velocidad/i) as HTMLSelectElement;
    select.focus();
    fireEvent.change(select, { target: { value: "115200" } });

    expect(setPrinterBaudRate).toHaveBeenCalledWith(115200);
    expect(toast.success).toHaveBeenCalledWith("Velocidad: 115200 baudios");
    expect(select.value).toBe("115200");
    expect(document.activeElement).toBe(document.body);
  });

  it("'Probar velocidades' corre la sonda, se deshabilita 'Probando…' y avisa al terminar", async () => {
    let finish!: (r: { baud: number; ok: boolean }[]) => void;
    vi.mocked(probePrinterBaudRates).mockReturnValue(new Promise((res) => (finish = res)));
    setup({ port: true });
    fireEvent.click(await screen.findByRole("button", { name: /impresora lista/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /probar velocidades/i }));

    const busy = await screen.findByRole("menuitem", { name: /probando/i });
    expect(busy).toBeDisabled();
    expect(probePrinterBaudRates).toHaveBeenCalledTimes(1);

    finish([9600, 19200, 38400, 57600, 115200].map((baud) => ({ baud, ok: true })));
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        "Se imprimieron pruebas a 5 velocidades. Elegí la que salió legible en el menú Velocidad.",
      ),
    );
    expect(screen.getByRole("menuitem", { name: /probar velocidades/i })).toBeEnabled();
  });

  it("'Probar velocidades' sin ninguna prueba impresa → toast de error con el motivo", async () => {
    vi.mocked(probePrinterBaudRates).mockResolvedValue(
      [9600, 19200].map((baud) => ({ baud, ok: false, message: "No se pudo imprimir: sin puerto" })),
    );
    setup({ port: true });
    fireEvent.click(await screen.findByRole("button", { name: /impresora lista/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /probar velocidades/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No se pudo imprimir ninguna prueba: No se pudo imprimir: sin puerto",
      ),
    );
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("Esc cierra el menú", async () => {
    setup({ port: true });
    fireEvent.click(await screen.findByRole("button", { name: /impresora lista/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

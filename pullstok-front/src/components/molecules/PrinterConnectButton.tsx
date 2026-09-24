import { useCallback, useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { encodeTestTicketEscPos } from "@/utils/escpos";
import {
  connectPrinter,
  disconnectPrinter,
  getConnectedPrinterPort,
  getPrinterBaudRate,
  isSerialPrintingSupported,
  printBytes,
  probePrinterBaudRates,
  setPrinterBaudRate,
  SUPPORTED_BAUD_RATES,
} from "@/utils/serialPrinter";

type Status = "unsupported" | "disconnected" | "connected";

const UNSUPPORTED_TITLE = "Tu navegador no permite imprimir directo";

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Conecta la térmica por Web Serial (una sola vez; Chrome recuerda el permiso).
 * Conectada: el botón abre un menú mínimo con "Imprimir prueba", la velocidad
 * (baudios), "Probar velocidades" y "Desconectar".
 * Sin Web Serial queda deshabilitado con una explicación.
 *
 * El botón suelta el foco tras cada acción: con foco en un botón (y no en el
 * body) los atajos del listado (T, L, M...) dejarían de andar.
 */
export const PrinterConnectButton = () => {
  const supported = isSerialPrintingSupported();
  const [status, setStatus] = useState<Status>(supported ? "disconnected" : "unsupported");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [probing, setProbing] = useState(false);
  const [baud, setBaud] = useState(() => getPrinterBaudRate());
  const rootRef = useRef<HTMLDivElement>(null);

  // Puerto ya recordado por Chrome de una sesión anterior.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    getConnectedPrinterPort()
      .then((port) => {
        if (!cancelled && port) setStatus("connected");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supported]);

  // Menú: Esc o clic afuera lo cierran.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [menuOpen]);

  const release = () => (document.activeElement as HTMLElement | null)?.blur?.();

  const handleConnect = useCallback(async () => {
    release();
    setBusy(true);
    try {
      // connectPrinter DEBE arrancar dentro del gesto de click (requestPort).
      const result = await connectPrinter();
      if (result.ok) {
        setStatus("connected");
        toast.success("Impresora conectada");
      } else if (result.reason === "unsupported") {
        toast.error(UNSUPPORTED_TITLE);
      } else if (result.reason === "error") {
        toast.error(`No se pudo conectar: ${result.message ?? "error desconocido"}`);
      }
      // "cancelled": el usuario cerró el selector, sin aviso.
    } finally {
      setBusy(false);
    }
  }, []);

  const handleTest = async () => {
    release();
    setMenuOpen(false);
    const current = getPrinterBaudRate();
    try {
      await printBytes(encodeTestTicketEscPos());
      toast.success(`Prueba enviada a ${current} baudios`);
    } catch (e) {
      toast.error(`No se pudo imprimir la prueba (${current} baudios): ${errorMessage(e)}`);
    }
  };

  const handleBaudChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = Number(e.target.value);
    setPrinterBaudRate(next);
    setBaud(next);
    toast.success(`Velocidad: ${next} baudios`);
    release();
  };

  const handleProbe = async () => {
    release();
    setProbing(true);
    try {
      const results = await probePrinterBaudRates();
      const printed = results.filter((r) => r.ok).length;
      if (printed === 0) {
        toast.error(
          `No se pudo imprimir ninguna prueba: ${results.find((r) => r.message)?.message ?? "error desconocido"}`,
        );
      } else {
        toast.info(
          `Se imprimieron pruebas a ${printed} velocidades. Elegí la que salió legible en el menú Velocidad.`,
        );
      }
    } catch (e) {
      toast.error(`No se pudieron probar las velocidades: ${errorMessage(e)}`);
    } finally {
      setProbing(false);
    }
  };

  const handleDisconnect = async () => {
    release();
    setMenuOpen(false);
    await disconnectPrinter();
    setStatus("disconnected");
  };

  if (status === "connected") {
    return (
      <div ref={rootRef} className="relative">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => {
            release();
            setMenuOpen((o) => !o);
          }}
          className="whitespace-nowrap"
        >
          <Printer className="h-4 w-4 mr-2" />
          Impresora lista
          <span aria-hidden className="ml-2 h-2 w-2 rounded-full bg-green-500" />
        </Button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleTest}
              className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              Imprimir prueba
            </button>
            <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
              Velocidad
              <select
                value={baud}
                onChange={handleBaudChange}
                className="rounded-sm border bg-background px-1 py-0.5 text-sm"
              >
                {SUPPORTED_BAUD_RATES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              role="menuitem"
              onClick={handleProbe}
              disabled={probing}
              className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
            >
              {probing ? "Probando…" : "Probar velocidades"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleDisconnect}
              className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              Desconectar
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleConnect}
      disabled={status === "unsupported" || busy}
      title={status === "unsupported" ? UNSUPPORTED_TITLE : undefined}
      className="whitespace-nowrap"
    >
      <Printer className="h-4 w-4 mr-2" />
      Conectar impresora
    </Button>
  );
};

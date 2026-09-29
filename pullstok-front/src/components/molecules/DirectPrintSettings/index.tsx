import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAgentHealth,
  getAgentPrinters,
  isAgentEnabled,
  printAgentTest,
  setAgentEnabled,
  setAgentPrinter,
  type AgentHealth,
} from "@/utils/directPrintAgent";

const INSTALLER_URL =
  "https://github.com/emcon84/pullstok-erp/releases/latest/download/PullstokPrint-Setup.exe";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * Configuración de la impresión directa de tickets (agente local de Windows).
 * Es por PC: el flag "habilitado" vive en el localStorage de este navegador.
 */
export function DirectPrintSettings() {
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [checking, setChecking] = useState(true);
  const [printers, setPrinters] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(() => isAgentEnabled());

  const detect = useCallback(async () => {
    setChecking(true);
    try {
      const h = await getAgentHealth();
      setHealth(h);
      try {
        setPrinters(await getAgentPrinters());
      } catch (error) {
        setPrinters([]);
        toast.error(errorMessage(error, "No se pudo listar las impresoras"));
      }
    } catch {
      setHealth(null);
      setPrinters([]);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  const handleSelectPrinter = async (printer: string) => {
    if (!printer) return;
    setBusy(true);
    try {
      await setAgentPrinter(printer);
      setAgentEnabled(true);
      setEnabled(true);
      setHealth((h) => (h ? { ...h, printer } : h));
      toast.success(`Impresora configurada: ${printer}`);
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo configurar la impresora"));
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      await printAgentTest();
      toast.success("Ticket de prueba enviado");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo imprimir la prueba"));
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = () => {
    const next = !enabled;
    setAgentEnabled(next);
    setEnabled(next);
  };

  const connected = health !== null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Impresión directa de tickets</CardTitle>
        <CardDescription>
          Imprime el ticket en la térmica sin el panel de impresión del navegador. Se
          configura una vez por PC de caja.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">
            {checking
              ? "Buscando el agente..."
              : connected
                ? `Conectado v${health.version}`
                : "No detectado"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void detect()}
            disabled={checking}
          >
            {checking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reintentar
          </Button>
        </div>

        {!connected && !checking && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Descargá el instalador en la PC de la caja.</li>
              <li>Ejecutalo (no pide permisos de administrador).</li>
              <li>Volvé acá y tocá &quot;Reintentar&quot;.</li>
            </ol>
            <p>
              Si Windows muestra SmartScreen, elegí &quot;Más información&quot; y luego
              &quot;Ejecutar de todas formas&quot;.
            </p>
            <Button asChild variant="outline">
              <a href={INSTALLER_URL} download>
                <Download className="mr-2 h-4 w-4" />
                Descargar instalador
              </a>
            </Button>
          </div>
        )}

        {connected && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="directPrintPrinter">Impresora</Label>
              <select
                id="directPrintPrinter"
                value={health.printer ?? ""}
                disabled={busy}
                onChange={(e) => void handleSelectPrinter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="" disabled>
                  Elegí una impresora
                </option>
                {printers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleTest} disabled={busy}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir prueba
              </Button>
              <Button type="button" variant="ghost" onClick={handleToggle}>
                {enabled ? "Desactivar impresión directa" : "Activar impresión directa"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

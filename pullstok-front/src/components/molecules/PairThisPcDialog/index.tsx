import { useState } from "react";
import { CheckCircle2, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreatePairingCode } from "@/components/hooks/usePrinters";
import { pairAgent } from "@/utils/directPrintAgent";

interface PairThisPcDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Outcome =
  | { kind: "paired"; code: string }
  | { kind: "manual"; code: string; reason: string }
  | { kind: "error"; message: string };

const message = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/**
 * "Emparejar este equipo": genera el código en el servidor y, como el admin está
 * en la PC de caja, se lo manda solo al agente local (POST /pair). El código
 * también se muestra para usarlo a mano si el agente no responde.
 */
export function PairThisPcDialog({ open, onOpenChange }: PairThisPcDialogProps) {
  const [name, setName] = useState("Caja");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const createCode = useCreatePairingCode();

  const handleGenerate = async () => {
    setBusy(true);
    setOutcome(null);
    let code: string;
    try {
      code = (await createCode.mutateAsync(name.trim())).code;
    } catch (e) {
      setOutcome({ kind: "error", message: message(e, "No se pudo generar el código") });
      setBusy(false);
      return;
    }
    try {
      await pairAgent(code);
      setOutcome({ kind: "paired", code });
    } catch (e) {
      setOutcome({
        kind: "manual",
        code,
        reason: message(e, "No se pudo conectar con el agente de impresión"),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async (code: string) => {
    setBusy(true);
    try {
      await pairAgent(code);
      setOutcome({ kind: "paired", code });
    } catch (e) {
      setOutcome({
        kind: "manual",
        code,
        reason: message(e, "No se pudo conectar con el agente de impresión"),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setOutcome(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Emparejar este equipo</DialogTitle>
          <DialogDescription>
            Vincula la PC donde está el agente de impresión con tu cuenta, para imprimir
            tickets desde el celular.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="pair-name">Nombre del equipo</Label>
            <Input
              id="pair-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Caja"
            />
          </div>

          <Button
            className="h-12 w-full"
            onClick={() => void handleGenerate()}
            disabled={busy || !name.trim()}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Generar código
          </Button>

          {outcome?.kind === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {outcome.message}
            </p>
          )}

          {outcome && outcome.kind !== "error" && (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
              {outcome.kind === "paired" ? (
                <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Este equipo quedó emparejado
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {outcome.reason}. Abrí el agente en la PC de caja y reintentá desde
                    esta pantalla; el código vence en 10 minutos.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    disabled={busy}
                    onClick={() => void handleRetry(outcome.code)}
                  >
                    Reintentar en este equipo
                  </Button>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Código de emparejamiento</p>
                <p className="select-all font-mono text-2xl font-bold tracking-widest">
                  {outcome.code}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

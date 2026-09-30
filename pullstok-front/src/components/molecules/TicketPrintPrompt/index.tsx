import { CheckCircle2, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TicketPrintState } from "@/components/hooks/useTicketPrint";

interface TicketPrintPromptProps {
  state: TicketPrintState;
  onPrint: () => void;
  onChoose: (printerId: string | null) => void;
  onDismiss: () => void;
  /** Opcional: abre el panel de impresión del navegador (acción explícita tras un error). */
  onUseBrowserPanel?: () => void;
}

/**
 * Tarjeta posterior a cobrar: un toque para imprimir el ticket y el estado
 * (Imprimiendo… / Impreso / Venció / Error). Pensada para el celular: botones
 * grandes y colores del tema (claro/oscuro).
 */
export function TicketPrintPrompt({ state, onPrint, onChoose, onDismiss, onUseBrowserPanel }: TicketPrintPromptProps) {
  const { phase, message, printers } = state;
  const working = phase === "sending" || phase === "pending";
  const failed = phase === "expired" || phase === "error";

  return (
    <div
      role="status"
      className="space-y-3 rounded-xl border border-primary/40 bg-card p-4 text-card-foreground shadow-sm"
    >
      <p className="flex items-center gap-2 text-base font-semibold">
        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        Venta cobrada
      </p>

      {phase === "idle" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="h-14 flex-1 text-base" onClick={onPrint}>
            <Printer className="mr-2 h-5 w-5" />
            Imprimir ticket
          </Button>
          <Button variant="outline" className="h-14 text-base" onClick={onDismiss}>
            No imprimir
          </Button>
        </div>
      )}

      {working && (
        <p className="flex items-center gap-2 text-base">
          <Loader2 className="h-5 w-5 animate-spin" />
          {message}
        </p>
      )}

      {phase === "choosing" && (
        <div className="space-y-2">
          <p className="text-base">{message}</p>
          {(printers ?? []).map((p) => (
            <Button
              key={p.id}
              variant="outline"
              className="h-14 w-full justify-between text-base"
              onClick={() => onChoose(p.id)}
            >
              <span>{p.name}</span>
              {!p.agentOnline && (
                <span className="text-xs text-muted-foreground">sin conexión</span>
              )}
            </Button>
          ))}
          <Button variant="ghost" className="h-12 w-full" onClick={() => onChoose(null)}>
            Cancelar
          </Button>
        </div>
      )}

      {phase === "printed" && (
        <p className="text-base font-medium text-green-700 dark:text-green-400">{message}</p>
      )}
      {failed && <p className="text-base font-medium text-destructive">{message}</p>}
      {phase === "panel" && <p className="text-base text-muted-foreground">{message}</p>}

      {(phase === "printed" || phase === "panel") && (
        <Button className="h-14 w-full text-base" onClick={onDismiss}>
          Listo
        </Button>
      )}
      {failed && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="h-14 flex-1 text-base" onClick={onPrint}>
            Reintentar
          </Button>
          <Button variant="outline" className="h-14 text-base" onClick={onDismiss}>
            Cerrar
          </Button>
          {onUseBrowserPanel && (
            <Button variant="outline" className="h-14 text-base" onClick={onUseBrowserPanel}>
              Usar el panel del navegador
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PrintTicketDialogProps {
  open: boolean;
  /** "Sí": imprimir el ticket. */
  onPrint: () => void;
  /** "No" / Esc / clic afuera: cerrar sin imprimir. */
  onSkip: () => void;
  /** Se llama tras cerrarse, en lugar de la restauración de foco por defecto de
   *  Radix (el botón que tenía el foco ya no existe: el carrito se vació). */
  onClosed?: () => void;
}

/**
 * Pregunta "¿Imprimir ticket?" después de una venta confirmada. Presentacional.
 * Teclado: S / Enter = sí, N / Esc = no. El foco arranca en "Sí, imprimir".
 */
export const PrintTicketDialog = ({
  open,
  onPrint,
  onSkip,
  onClosed,
}: PrintTicketDialogProps) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      onPrint();
    } else if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      onSkip();
    } else if (e.key === "Enter") {
      // Con el foco en "No", Enter lo activa el propio botón (clic nativo).
      if ((e.target as HTMLElement).dataset.ticketAction === "skip") return;
      e.preventDefault();
      onPrint();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onSkip()}>
      <DialogContent
        className="sm:max-w-xs"
        showCloseButton={false}
        onKeyDown={handleKeyDown}
        onCloseAutoFocus={(e) => {
          if (!onClosed) return;
          e.preventDefault();
          onClosed();
        }}
      >
        <DialogHeader>
          <DialogTitle>¿Imprimir ticket?</DialogTitle>
          <DialogDescription>
            Comprobante no fiscal para la impresora térmica.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-center">
          <Button variant="outline" data-ticket-action="skip" onClick={onSkip}>
            No
          </Button>
          {/* autoFocus: mismo patrón que el modal de escaneo; Enter lo activa. */}
          <Button autoFocus data-ticket-action="print" onClick={onPrint}>
            <Printer className="mr-2 h-4 w-4" />
            Sí, imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

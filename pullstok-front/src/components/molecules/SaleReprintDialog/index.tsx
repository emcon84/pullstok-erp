import { useMemo } from "react";
import DateObject from "react-date-object";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TicketPrintPrompt } from "@/components/molecules/TicketPrintPrompt";
import { useTicketPrint } from "@/components/hooks/useTicketPrint";
import { useTicketCompany } from "@/components/hooks/useTicketCompany";
import type { Sale } from "@/models/salesModel";
import { saleToTicket } from "@/utils/saleToTicket";
import { money } from "@/utils/saleTicket";

interface SaleReprintDialogProps {
  /** Venta a reimprimir; null = cerrado. */
  sale: Sale | null;
  onClose: () => void;
}

/**
 * Reimpresión del ticket de una venta ya guardada. Se monta SOLO con una venta
 * (por eso el contenido interno es otro componente): useTicketPrint queda atado
 * a la sucursal de ESA venta y arranca en estado limpio cada vez.
 */
export function SaleReprintDialog({ sale, onClose }: SaleReprintDialogProps) {
  if (!sale) return null;
  return <ReprintContent key={sale.id ?? sale._id} sale={sale} onClose={onClose} />;
}

function ReprintContent({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const branchId = sale.branchId ?? null;
  const company = useTicketCompany(branchId);
  const ticketPrint = useTicketPrint(branchId);
  const { reset } = ticketPrint;

  // Mismo layout que el ticket original, con la fecha original y "REIMPRESIÓN".
  const ticket = useMemo(() => saleToTicket(sale, company), [sale, company]);

  const close = () => {
    reset();
    onClose();
  };

  const when = new DateObject(sale.saleDate).format("DD-MM-YYYY");

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reimprimir ticket</DialogTitle>
          <DialogDescription>
            Venta del {when} · {money(sale.totalAmount)}. Sale marcado como REIMPRESIÓN.
          </DialogDescription>
        </DialogHeader>
        <TicketPrintPrompt
          state={ticketPrint.state}
          title="Ticket de la venta"
          dismissLabel="Cancelar"
          onPrint={() => void ticketPrint.print(ticket)}
          onUseBrowserPanel={() => void ticketPrint.printInBrowser(ticket)}
          onChoose={ticketPrint.choose}
          onDismiss={close}
        />
      </DialogContent>
    </Dialog>
  );
}

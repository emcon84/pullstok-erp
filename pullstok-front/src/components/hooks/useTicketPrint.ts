import { useCallback, useEffect, useRef, useState } from "react";
import { printSaleTicketViaAgent } from "@/utils/printTicketAgent";
import { JOB_MESSAGES, watchPrintJob, type RelayPrinter } from "@/utils/relayPrint";
import type { SaleTicket } from "@/utils/saleTicket";

export type TicketPrintPhase =
  | "idle"
  | "sending"
  | "choosing"
  | "pending"
  | "printed"
  | "expired"
  | "error"
  | "panel";

export interface TicketPrintState {
  phase: TicketPrintPhase;
  message: string;
  /** Solo en "choosing": impresoras entre las que elegir. */
  printers?: RelayPrinter[];
}

const IDLE: TicketPrintState = { phase: "idle", message: "" };

/**
 * Imprime el ticket de una venta con el orden agente local -> relay al local ->
 * panel de Chrome, y expone el estado para mostrarlo (Imprimiendo… / Impreso /
 * Venció / Error). Un solo trabajo a la vez.
 */
export function useTicketPrint(branchId: string | null) {
  const [state, setState] = useState<TicketPrintState>(IDLE);
  const busy = useRef(false);
  const chooser = useRef<((id: string | null) => void) | null>(null);
  const watcher = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      watcher.current?.abort();
    };
  }, []);

  const update = useCallback((next: TicketPrintState) => {
    if (mounted.current) setState(next);
  }, []);

  const print = useCallback(
    async (ticket: SaleTicket) => {
      if (busy.current) return;
      busy.current = true;
      update({ phase: "sending", message: JOB_MESSAGES.sending });
      try {
        const result = await printSaleTicketViaAgent(ticket, {
          branchId,
          chooseRelayPrinter: (printers) =>
            new Promise<string | null>((resolve) => {
              chooser.current = resolve;
              update({ phase: "choosing", message: "¿En qué impresora?", printers });
            }),
          onRelayJob: (jobId) => {
            watcher.current?.abort();
            const controller = new AbortController();
            watcher.current = controller;
            update({ phase: "pending", message: JOB_MESSAGES.pending });
            void watchPrintJob(jobId, (u) => update({ phase: u.phase, message: u.message }), {
              signal: controller.signal,
            });
          },
        });
        if (result === "agent") update({ phase: "printed", message: JOB_MESSAGES.printed });
        else if (result === "panel")
          update({ phase: "panel", message: "Se abrió el panel de impresión del navegador." });
        else if (result === "cancelled") update(IDLE);
        // "relay": el estado lo lleva watchPrintJob.
      } catch {
        update({ phase: "error", message: JOB_MESSAGES.error });
      } finally {
        busy.current = false;
      }
    },
    [branchId, update],
  );

  const choose = useCallback((printerId: string | null) => {
    const resolve = chooser.current;
    chooser.current = null;
    resolve?.(printerId);
  }, []);

  const reset = useCallback(() => {
    watcher.current?.abort();
    watcher.current = null;
    chooser.current?.(null);
    chooser.current = null;
    update(IDLE);
  }, [update]);

  return { state, print, choose, reset };
}

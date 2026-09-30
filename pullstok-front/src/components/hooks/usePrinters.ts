import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPairingCode,
  createPrinter,
  deletePrinter,
  getPrintAgents,
  getPrinters,
  updatePrinter,
  type PrintAgentData,
  type PrinterData,
  type PrinterPayload,
} from "@/services/printerService";

const PRINTERS_KEY = ["printers"];
const AGENTS_KEY = ["printAgents"];

/** Impresoras de la org (ADMIN/MANAGEMENT). El estado online se refresca solo. */
export const usePrinters = () =>
  useQuery<PrinterData[], Error>({
    queryKey: PRINTERS_KEY,
    queryFn: getPrinters,
    refetchInterval: 30_000,
  });

export const usePrintAgents = () =>
  useQuery<PrintAgentData[], Error>({
    queryKey: AGENTS_KEY,
    queryFn: getPrintAgents,
    refetchInterval: 30_000,
  });

export const useSavePrinter = () => {
  const qc = useQueryClient();
  return useMutation<PrinterData, Error, { id?: string; data: PrinterPayload }>({
    mutationFn: ({ id, data }) => (id ? updatePrinter(id, data) : createPrinter(data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTERS_KEY }),
  });
};

export const useDeletePrinter = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deletePrinter(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTERS_KEY }),
  });
};

export const useCreatePairingCode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createPairingCode(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
};

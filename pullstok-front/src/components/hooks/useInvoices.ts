import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelInvoice,
  createInvoice,
  createInvoiceFromSale,
  CreateInvoiceFromSaleBody,
  deleteInvoice,
  getInvoiceById,
  getInvoices,
  issueInvoice,
  markInvoiceAsPaid,
  updateInvoice,
} from "../../services/invoiceServices";
import {
  CreateInvoiceRequest,
  Invoice,
  UpdateInvoiceRequest,
} from "../../models/invoiceModel";

/**
 * Hooks de data-fetching del módulo Facturación de Servicios
 * (sdd/facturacion-servicios, WS4). Mismo patrón de useSuperadmin.ts:
 * useQuery para lectura, useMutation + invalidateQueries(['invoices'])
 * para escritura.
 */

export const useGetInvoices = () => {
  const { data, error, isLoading, isError } = useQuery<Invoice[], Error>({
    queryKey: ["invoices"],
    queryFn: getInvoices,
  });

  return {
    invoices: data || [],
    loadingInvoices: isLoading,
    errorInvoices: isError ? error : null,
  };
};

export const useGetInvoiceById = (id: string | undefined) => {
  const { data, error, isLoading, isError } = useQuery<Invoice, Error>({
    queryKey: ["invoices", id],
    queryFn: () => getInvoiceById(id as string),
    enabled: !!id,
  });

  return {
    invoice: data,
    loadingInvoice: isLoading,
    errorInvoice: isError ? error : null,
  };
};

export const useCreateInvoice = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<Invoice, Error, CreateInvoiceRequest>({
    mutationFn: createInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    submitInvoice: mutation.mutate,
    loadingCreate: mutation.isPending,
  };
};

export const useUpdateInvoice = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    Invoice,
    Error,
    { id: string; data: UpdateInvoiceRequest }
  >({
    mutationFn: updateInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    editInvoice: mutation.mutate,
    loadingUpdate: mutation.isPending,
  };
};

export const useDeleteInvoice = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, string>({
    mutationFn: deleteInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    removeInvoice: mutation.mutate,
    loadingDelete: mutation.isPending,
  };
};

export const useIssueInvoice = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<Invoice, Error, string>({
    mutationFn: issueInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    issueInvoice: mutation.mutate,
    loadingIssue: mutation.isPending,
  };
};

export const useMarkInvoiceAsPaid = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<Invoice, Error, string>({
    mutationFn: markInvoiceAsPaid,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    markAsPaid: mutation.mutate,
    loadingMarkAsPaid: mutation.isPending,
  };
};

export const useCancelInvoice = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<Invoice, Error, string>({
    mutationFn: cancelInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    cancelInvoice: mutation.mutate,
    loadingCancel: mutation.isPending,
  };
};

/**
 * WS3 — Hook para facturar una venta existente.
 * Invalida tanto ["invoices"] como ["sales"] para que la lista de ventas
 * actualice el badge "Facturada".
 */
export const useCreateInvoiceFromSale = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    Invoice,
    Error,
    { saleId: string; body: CreateInvoiceFromSaleBody }
  >({
    mutationFn: ({ saleId, body }) => createInvoiceFromSale(saleId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
  });

  return {
    invoiceFromSale: mutation.mutateAsync,
    loadingInvoiceFromSale: mutation.isPending,
    errorInvoiceFromSale: mutation.error,
  };
};

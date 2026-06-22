import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createOrganization,
  getOrganizations,
  registerOrganizationBilling,
  setOrganizationActive,
  updateOrganizationPlan,
  CreateOrganizationPayload,
  SuperadminOrganization,
} from "../../services/superadminService";

/**
 * Hooks de data-fetching del panel superadmin (sdd/planes-y-billing, Fase 6).
 * Mismo patrón de useCustomer.ts: useQuery para lectura, useMutation +
 * invalidateQueries(['organizations']) para escritura.
 */

export const useOrganizations = () => {
  const { data, error, isLoading, isError } = useQuery<
    SuperadminOrganization[],
    Error
  >({
    queryKey: ["organizations"],
    queryFn: getOrganizations,
  });

  return {
    organizations: data,
    loadingOrganizations: isLoading,
    errorOrganizations: isError ? error : null,
  };
};

export const useCreateOrganization = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    SuperadminOrganization,
    Error,
    CreateOrganizationPayload
  >({
    mutationFn: createOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });

  return {
    submitOrganization: mutation.mutate,
    loadingCreate: mutation.isPending,
  };
};

export const useUpdateOrganizationPlan = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    SuperadminOrganization,
    Error,
    { id: string; plan: SuperadminOrganization["plan"] }
  >({
    mutationFn: updateOrganizationPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });

  return {
    changePlan: mutation.mutate,
    loadingPlanChange: mutation.isPending,
  };
};

export const useRegisterOrganizationBilling = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<SuperadminOrganization, Error, string>({
    mutationFn: registerOrganizationBilling,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });

  return {
    registerPayment: mutation.mutate,
    loadingPayment: mutation.isPending,
  };
};

export const useSetOrganizationActive = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    SuperadminOrganization,
    Error,
    { id: string; isActive: boolean }
  >({
    mutationFn: setOrganizationActive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });

  return {
    toggleActive: mutation.mutate,
    loadingToggleActive: mutation.isPending,
  };
};

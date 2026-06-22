// src/controllers/BudgetController.ts
import { Budget, CreateBudget } from '../../models/budgetModel';
import { createBudget, getBudgetById, getBudgets, updateBudget, deleteBudget } from '../../services/budgetService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';



export const useGetBudgets = () => {
  const { data: budgets, error, isLoading } = useQuery<Budget[], Error>({
    queryKey: ['budgets'],
    queryFn: getBudgets,
  });

  return {
    budgets: budgets || [],
    loading: isLoading,
    error,
  };
};

export const useGetBudgetByID = (quotationId: string) => {
  return useQuery({
    queryKey: ['budget', quotationId],
    queryFn: () => getBudgetById(quotationId),
    enabled: !!quotationId, // Solo realiza la consulta si el ID del presupuesto está disponible
  });
};

export const useCreateBudget = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<void, Error, CreateBudget>({
    mutationFn: createBudget,     onMutate: () => {
      // Opcional: lógica antes de iniciar la mutación
    },
    onError: (error) => {
      console.error('Error creating budget:', error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(); 
      console.log('Budget created successfully');
    },
    onSettled: () => {
      // Lógica después de que la mutación ha finalizado, ya sea con éxito o con error
    },
  });

  return {
    submitBudget: mutation.mutate,
    loading: mutation.status === 'pending', // Verifica si está en estado de carga
    error: mutation.isError ? mutation.error : null, // Verifica si hay un error
    success: mutation.isSuccess, // Verifica si fue exitoso
  };
};

// Hook para editar un presupuesto
export const useUpdateBudget = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<void, Error, { id: string; data: CreateBudget }>({
    mutationFn: ({ id, data }) => updateBudget(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  return {
    updateBudget: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
  };
};

// Hook para eliminar un presupuesto
export const useDeleteBudget = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<void, Error, string>({
    mutationFn: deleteBudget,
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
  return {
    deleteBudget: mutation.mutate,
    loading: mutation.isPending,
  };
};

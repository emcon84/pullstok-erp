import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCustomers,  createCustomer, updateCustomer, deleteCustomer } from '../../services/customerService'; // Asegúrate de importar correctamente
import { CreateCustomer, Customer } from '../../models/customerModel';

export const useCustomers = () => {
  const { data, error, isLoading, isError } = useQuery<Customer[], Error>({
    queryKey: ['customers'], // Identificador único para esta consulta
    queryFn: getCustomers, // Función que realiza la consulta
  });

  return {
    customers: data,
    loadingCustomer: isLoading,
    errorCustomer: isError ? error : null,
  };
};

export const useCreateCustomer = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<Customer, Error, CreateCustomer>({
    mutationFn: createCustomer, // Función que realiza la mutación (creación del cliente)
    onError: (error) => {
      console.error('Error creating customer:', error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  return {
    submitCustomer: mutation.mutate,
    submitCustomerAsync: mutation.mutateAsync,
    loadingCustomer: mutation.status === 'pending', // Verifica si está en estado de carga
    errorCustomer: mutation.isError ? mutation.error : null, // Verifica si hay un error
    successCustomer: mutation.isSuccess, // Verifica si fue exitoso
  };
};

// Hook para actualizar un cliente
export const useUpdateCustomer = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<Customer, Error, Customer>({
    mutationFn: updateCustomer,
    onError: (error) => {
      console.error('Error updating customer:', error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  return {
    updateCustomer: mutation.mutate,
    loadingUpdate: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

// Hook para eliminar un cliente
export const useDeleteCustomer = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, string>({
    mutationFn: deleteCustomer,
    onError: (error) => {
      console.error('Error deleting customer:', error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  return {
    deleteCustomer: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};
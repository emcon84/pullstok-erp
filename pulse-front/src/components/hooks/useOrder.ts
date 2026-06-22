import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createOrder, getOrders, updateOrder, deleteOrder } from '../../services/orderService';
import { CreateOrder, Order, UpdateOrder } from '../../models/orderModel';

// Hook para obtener las órdenes
export const useOrders = () => {
  const { data: orders, error, isLoading } = useQuery<Order[], Error>({
    queryKey: ['orders'],
    queryFn: getOrders,
  });

  return {
    orders: orders || [],
    loading: isLoading,
    error,
  };
};

// Hook para crear una nueva orden
export const useCreateOrder = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, CreateOrder>({
    mutationFn: createOrder,
    onMutate: () => {
      // Opcional: lógica antes de iniciar la mutación
    },
    onError: (error) => {
      console.error('Error creating order:', error.message);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      console.log('Order created successfully:', data);
    },
    onSettled: () => {
      // Lógica después de que la mutación ha finalizado, ya sea con éxito o con error
    },
  });

  return {
    submitOrder: mutation.mutate,
    loading: mutation.status === 'pending', // Verifica si está en estado de carga
    error: mutation.isError ? mutation.error : null, // Verifica si hay un error
    success: mutation.isSuccess, // Verifica si fue exitoso
  };
};

// Hook para editar una orden (items)
export const useUpdateOrder = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, { id: string; data: UpdateOrder }>({
    mutationFn: ({ id, data }) => updateOrder(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  return {
    updateOrder: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
  };
};

// Hook para eliminar una orden
export const useDeleteOrder = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<void, Error, string>({
    mutationFn: deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
  return {
    deleteOrder: mutation.mutate,
    loading: mutation.isPending,
  };
};
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createOrder, getOrders } from '../../services/orderService';
import { CreateOrder, Order } from '../../models/orderModel';

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
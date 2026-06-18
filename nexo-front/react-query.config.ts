// src/react-query.ts
import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2, // Número de reintentos en caso de fallo
      refetchOnWindowFocus: false, // No refetch al enfocar la ventana
    },
  },
});

export default queryClient;

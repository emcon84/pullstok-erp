
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadProductsCsv } from '../../services/uploadProductsCsv';


export const useUploadProductsCsv = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, File>({
      mutationFn: uploadProductsCsv,
      onMutate: () => {
          // Opcional: lógica antes de iniciar la mutación, como mostrar un spinner
      },
      onError: (error) => {
          console.error('Error uploading CSV:', error.message);
      },
      onSuccess: () => {
          queryClient.invalidateQueries(); // Invalida las queries relevantes si es necesario
          console.log('CSV uploaded successfully');
      },
      onSettled: () => {
          // Lógica después de que la mutación ha finalizado, ya sea con éxito o con error
      },
  });

  return {
      submitUpload: mutation.mutate, // Función para iniciar la mutación
      loading: mutation.status === 'pending', // Estado de carga
      error: mutation.isError ? mutation.error : null, // Error, si ocurrió
      success: mutation.isSuccess, // Verifica si fue exitoso
  };
};

import { useEffect, useState } from "react";
import { productsList } from "../../controllers/productController";
import { products as fetchProducts, createProduct as createNewProduct, updateProduct as updateExistingProduct, deleteProduct  } from '../../services/productService';
import { DataItem } from "../../types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";



export const usePorducts = () => {
  const [products, setProducts] = useState([]);

  const getProducts = async () => {
    try {
      const response = await productsList();
      setProducts(response);
    } catch (error) {
      console.error(error);     
    }
  };

  useEffect(() => {
    getProducts();
  }, []);

  return {
    products,
    getProducts
  };
}



// Hook para obtener la lista de productos
export const useProducts = () => {
  const { data, error, isLoading } = useQuery<DataItem[], Error>({
    queryKey: ['products'],
    queryFn: fetchProducts,
  });

  return {
    products: data || [],
    loading: isLoading,
    error,
  };
};

// Hook para crear un nuevo producto
export const useCreateProduct = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, DataItem>({
    mutationFn: createNewProduct,
    onError: (error) => {
      console.error('Error creating product:', error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['products']});
    },
  });

  return {
    createProduct: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

// Hook para actualizar un producto
export const useUpdateProduct = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, DataItem>({
    mutationFn: updateExistingProduct,
    onError: (error) => {
      console.error('Error updating product:', error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  return {
    updateProduct: mutation.mutate,
    loading: mutation.status === 'pending',
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

export const useDeleteProduct = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      toast.success('Producto eliminado correctamente');
      queryClient.invalidateQueries({queryKey: ['products']});
    },
    onError: (error: Error) => {
      // Manejo de errores más específico basado en el mensaje del backend
      if (error.message.includes('associated orders')) {
        toast.error('El producto no se puede eliminar porque tiene órdenes asociadas');
      } else if (error.message.includes('associated budgets')) {
        toast.error('El producto no se puede eliminar porque tiene presupuestos asociados');
      } else {
        toast.error('Error al eliminar el producto');
      }
    },
  });

  return {
    deleteProduct: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.error,
    success: mutation.isSuccess,
  };
};
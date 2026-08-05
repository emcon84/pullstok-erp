import { useEffect, useMemo, useState } from "react";
import { productsList } from "../../controllers/productController";
import { PaginatedProducts, ProductFacets, products as fetchProducts, getProductFacets, createProduct as createNewProduct, updateProduct as updateExistingProduct, deleteProduct  } from '../../services/productService';
import { DataItem } from "../../types";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, InfiniteData } from "@tanstack/react-query";
import { toast } from "react-toastify";



export const usePorducts = () => {
  const [products, setProducts] = useState<DataItem[]>([]);

  const getProducts = async () => {
    try {
      const response = await productsList();
      setProducts(response || []);
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
export const useProducts = (branchId?: string, search?: string, category?: string) => {
  const { data, error, isLoading } = useQuery<DataItem[], Error>({
    queryKey: ["products", branchId, search, category].filter(Boolean),
    queryFn: () => fetchProducts(branchId, search, category),
    placeholderData: (prev) => prev, // keep previous while fetching
  });

  return {
    products: data || [],
    loading: isLoading,
    error,
  };
};

/** Page size for the server-side paginated product list (infinite scroll). */
export const PAGE_SIZE = 30;

/**
 * Infinite-scroll variant of useProducts (vendor dashboard). Opts in to
 * server-side pagination by sending page/pageSize; merges pages into a flat
 * `items: DataItem[]`. Keeps a deterministic order (name asc, server-side).
 */
export const useInfiniteProducts = (
  branchId?: string,
  search?: string,
  category?: string,
) => {
  const queryKey = ["products", branchId, search, category].filter(Boolean);

  const {
    data,
    error,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<
    PaginatedProducts,
    Error,
    InfiniteData<PaginatedProducts>,
    unknown[],
    number
  >({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchProducts(branchId, search, category, pageParam, PAGE_SIZE),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    initialPageParam: 1,
    placeholderData: (prev) => prev, // keep previous pages while searching
  });

  const items = useMemo<DataItem[]>(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  return {
    items,
    isLoadingInitial: isPending,
    isFetchingNextPage,
    hasNextPage,
    loadMore: fetchNextPage,
    error,
  };
};

/**
 * Fetches the complete filter facets (all org categories + variant groups for
 * the selected category). When a category is selected the variants refetch for
 * it; when cleared (category undefined) variants come back empty but the
 * categories stay complete.
 */
export const useProductFacets = (category?: string) => {
  const { data, isLoading } = useQuery<ProductFacets, Error>({
    queryKey: ["product-facets", category || "all"],
    queryFn: () => getProductFacets(category),
    placeholderData: (prev) => prev, // keep previous while fetching
  });

  return {
    categories: data?.categories ?? [],
    variants: data?.variants ?? [],
    loading: isLoading,
  };
};

// Hook para crear un nuevo producto
export const useCreateProduct = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<DataItem, Error, DataItem>({
    mutationFn: createNewProduct,
    onError: (error) => {
      console.error('Error creating product:', error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['products']});
      queryClient.invalidateQueries({queryKey: ['product-facets']});
    },
  });

  return {
    createProduct: mutation.mutateAsync,
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
      queryClient.invalidateQueries({queryKey: ['product-facets']});
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
      queryClient.invalidateQueries({queryKey: ['product-facets']});
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
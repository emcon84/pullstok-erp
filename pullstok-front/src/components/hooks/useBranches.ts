import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBranches,
  createBranch as createBranchApi,
  updateBranch as updateBranchApi,
  toggleBranchActive as toggleBranchActiveApi,
  deleteBranch as deleteBranchApi,
  type BranchData,
  type CreateBranchPayload,
  type UpdateBranchPayload,
} from "@/services/branchService";

/** Fetches the list of active branches in the current organization. */
export const useBranches = (enabled = true) => {
  const { data, error, isLoading, refetch } = useQuery<BranchData[], Error>({
    queryKey: ["branches"],
    queryFn: getBranches,
    enabled,
  });

  return {
    branches: data || [],
    loading: isLoading,
    error,
    refetch,
  };
};

/** Creates a new branch and invalidates the branches query on success. */
export const useCreateBranch = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<BranchData, Error, CreateBranchPayload>({
    mutationFn: createBranchApi,
    onError: (error) => {
      console.error("Error creating branch:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
  });

  return {
    createBranch: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

/** Updates a branch and invalidates the branches query on success. */
export const useUpdateBranch = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    BranchData,
    Error,
    { id: string; data: UpdateBranchPayload }
  >({
    mutationFn: ({ id, data }) => updateBranchApi(id, data),
    onError: (error) => {
      console.error("Error updating branch:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
  });

  return {
    updateBranch: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

/** Deletes a branch and invalidates the branches query on success. */
export const useDeleteBranch = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, string>({
    mutationFn: deleteBranchApi,
    onError: (error) => {
      console.error("Error deleting branch:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
  });

  return {
    deleteBranch: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

/** Toggles a branch's isActive status and invalidates the branches query on success. */
export const useToggleBranchActive = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    { message: string },
    Error,
    { id: string; isActive: boolean }
  >({
    mutationFn: ({ id, isActive }) => toggleBranchActiveApi(id, isActive),
    onError: (error) => {
      console.error("Error toggling branch active:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
  });

  return {
    toggleBranchActive: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

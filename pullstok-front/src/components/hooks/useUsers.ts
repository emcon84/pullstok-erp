import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getUsers,
  createUser as createUserApi,
  setUserActive as setUserActiveApi,
  deleteUser as deleteUserApi,
  type UserData,
  type CreateUserPayload,
} from "@/services/userService";

/** Fetches the list of users in the current organization. */
export const useUsers = () => {
  const { data, error, isLoading, refetch } = useQuery<UserData[], Error>({
    queryKey: ["users"],
    queryFn: getUsers,
  });

  return {
    users: data || [],
    loading: isLoading,
    error,
    refetch,
  };
};

/** Creates a new user and invalidates the users query on success. */
export const useCreateUser = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<UserData, Error, CreateUserPayload>({
    mutationFn: createUserApi,
    onError: (error) => {
      console.error("Error creating user:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  return {
    createUser: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

/** Toggles a user's isActive status and invalidates the users query on success. */
export const useSetUserActive = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    { message: string },
    Error,
    { id: string; isActive: boolean }
  >({
    mutationFn: ({ id, isActive }) => setUserActiveApi(id, isActive),
    onError: (error) => {
      console.error("Error toggling user active:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  return {
    setUserActive: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

/** Deletes a user and invalidates the users query on success. */
export const useDeleteUser = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, string>({
    mutationFn: deleteUserApi,
    onError: (error) => {
      console.error("Error deleting user:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  return {
    deleteUser: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

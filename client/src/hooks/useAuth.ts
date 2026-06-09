import { useQuery } from '@tanstack/react-query';
import { getMe } from '../api/auth.js';
import type { MeResponse } from '../api/auth.js';
import { ApiError } from '../api/client.js';

export function useAuth() {
  const query = useQuery<MeResponse, ApiError>({
    queryKey: ['me'],
    queryFn: getMe,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false;
      return failureCount < 2;
    },
    staleTime: 30_000,
  });

  return {
    user: query.data?.user ?? null,
    memberships: query.data?.memberships ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

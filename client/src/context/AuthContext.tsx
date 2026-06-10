import React, { createContext, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth.js';
import type { UserData, MembershipData } from '../api/auth.js';

interface AuthContextValue {
  user: UserData | null;
  memberships: MembershipData[];
  isLoading: boolean;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { user, memberships, isLoading, refetch } = useAuth();

  const handleRefetch = () => {
    void queryClient.invalidateQueries({ queryKey: ['me'] });
    void refetch();
  };

  return (
    <AuthContext.Provider value={{ user, memberships, isLoading, refetch: handleRefetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

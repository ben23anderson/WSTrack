import React, { createContext, useContext } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import type { UserData, MembershipData } from '../api/auth.js';

interface AuthContextValue {
  user: UserData | null;
  memberships: MembershipData[];
  isLoading: boolean;
  refetch: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, memberships, isLoading, refetch } = useAuth();

  const handleRefetch = () => {
    return refetch();
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

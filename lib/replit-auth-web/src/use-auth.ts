import { useCallback } from "react";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface BusinessAuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (returnTo?: string) => void;
  logout: () => void;
}

export function useBusinessAuth(): BusinessAuthState {
  const { data, isLoading } = useGetCurrentAuthUser();

  const login = useCallback((returnTo?: string) => {
    const baseUrl = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
    const base = baseUrl.replace(/\/+$/, "") || "/";
    const target = returnTo ?? base;
    window.location.href = `/api/login?returnTo=${encodeURIComponent(target)}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/api/logout";
  }, []);

  const user = data?.user ?? null;

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}

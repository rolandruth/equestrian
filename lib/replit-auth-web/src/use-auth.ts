import { useCallback } from "react";
import {
  useGetCurrentAuthUser,
  useBusinessLogin,
  useBusinessSignup,
  useBusinessLogout,
} from "@workspace/api-client-react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface BusinessAuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (returnTo?: string) => void;
  logout: () => void;
}

// Kept as `login`/`logout` (rather than exposing the mutation hooks directly)
// so existing call sites that only need a redirect-to-login-page shortcut
// don't have to import the login form's mutation hooks themselves. Pages
// that actually collect an email/password use `useBusinessLogin` /
// `useBusinessSignup` from `@workspace/api-client-react` directly.
export function useBusinessAuth(): BusinessAuthState {
  const { data, isLoading, refetch } = useGetCurrentAuthUser();
  const logoutMutation = useBusinessLogout();

  const login = useCallback((returnTo?: string) => {
    const baseUrl = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
    const base = baseUrl.replace(/\/+$/, "") || "/";
    const target = returnTo ?? base;
    window.location.href = `${base}/business/login?returnTo=${encodeURIComponent(target)}`;
  }, []);

  const logout = useCallback(() => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        refetch();
        window.location.reload();
      },
    });
  }, [logoutMutation, refetch]);

  const user = data?.user ?? null;

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}

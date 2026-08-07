import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 2, // 2 minutes — short enough to pick up session changes, long enough to avoid flicker
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Wipe every cached query so no data from this account survives into the
      // next session (prevents the previous user's wallet/jobs/profile from
      // flashing or leaking if someone else logs in without a full reload).
      queryClient.clear();

      // Navigate to the server logout endpoint. It destroys the session and
      // redirects to /auth (directly for manual users, or through the OIDC
      // end-session round-trip). We can't await the redirect, so:
      window.location.assign("/api/logout");

      // Fallback: if the navigation is blocked or the server fails to redirect,
      // force a reload into the auth page so the authenticated UI is never left
      // on screen with a dead session.
      window.setTimeout(() => {
        if (window.location.pathname !== "/auth") {
          window.location.href = "/auth";
        }
      }, 2000);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}

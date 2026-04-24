'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/lib/api/auth.api';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const {
    isAuthenticated,
    accessToken,
    _hasHydrated,
    isRehydrating,
    setAccessToken,
    setRehydrating,
    logout,
  } = useAuthStore();

  useEffect(() => {
    // Wait until Zustand has read localStorage
    if (!_hasHydrated) return;

    // Not logged in at all → go to login
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    // Logged in (localStorage says so) but access token is gone (page refresh) →
    // silently refresh using the HTTP-only refresh-token cookie
    if (!accessToken) {
      setRehydrating(true);
      authApi
        .refresh()
        .then(({ accessToken: newToken }) => {
          setAccessToken(newToken);
        })
        .catch(() => {
          logout();
          router.replace('/login');
        })
        .finally(() => {
          setRehydrating(false);
        });
    }
  }, [_hasHydrated, isAuthenticated, accessToken, router, setAccessToken, setRehydrating, logout]);

  // Still reading localStorage
  if (!_hasHydrated || isRehydrating) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  // Not authenticated and not in the middle of refreshing → redirect pending
  if (!isAuthenticated || !accessToken) {
    return null;
  }

  return <>{children}</>;
}

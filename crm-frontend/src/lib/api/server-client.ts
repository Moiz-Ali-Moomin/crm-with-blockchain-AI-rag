/**
 * Server-side API client for React Server Components
 *
 * Why a separate client from the browser axios client:
 * - Server Components run on Node.js — no window, no localStorage, no Zustand
 * - Auth tokens must come from cookies (forwarded from the browser request)
 * - Uses native fetch with Next.js caching directives (not axios)
 * - Every function is safe to call in async Server Components
 *
 * Auth strategy:
 * - Reads all request cookies via next/headers and forwards them to the backend
 * - The backend's httpOnly refresh-token cookie is included automatically
 * - Access token: if the backend sets it as a cookie on login, it's forwarded here.
 *   If your auth flow stores the access token in-memory only (Zustand), server fetches
 *   will return null and the Client Component islands (TanStack Query) will hydrate the data.
 *
 * Caching:
 * - `revalidate: 30` — analytics data, refreshed every 30s on the CDN edge
 * - `revalidate: 0` — user-specific data, never CDN-cached
 * - `cache: 'no-store'` — bypasses all caching (use for sensitive data)
 */

import { cookies } from 'next/headers';
import { cache } from 'react';

// Must match the defensive logic in client.ts — keep both in sync.
const _rawBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const API_BASE = _rawBase.endsWith('/api/v1') ? _rawBase : `${_rawBase}/api/v1`;

export type ServerFetchOptions = {
  revalidate?: number | false;
  tags?: string[];
};

async function buildCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
}

/**
 * Core server fetch — wraps native fetch with auth cookie forwarding,
 * Next.js cache directives, and envelope unwrapping.
 *
 * Returns `null` on any error (401, network failure, parse error) so Server
 * Components degrade gracefully and let Client Component islands take over.
 */
export async function serverFetch<T>(
  path: string,
  options: ServerFetchOptions = {},
): Promise<T | null> {
  const cookieHeader = await buildCookieHeader();

  const nextConfig =
    options.revalidate === false
      ? { cache: 'no-store' as const }
      : { next: { revalidate: options.revalidate ?? 30, tags: options.tags ?? [] } };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      ...nextConfig,
    });

    if (!res.ok) return null;

    const json = (await res.json()) as { success: boolean; data: T };
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

/**
 * React `cache()` deduplicates calls to the same function within one render.
 * Wrap expensive server fetches so multiple Server Components requesting the
 * same data only trigger one fetch per request.
 */
export const cachedServerFetch = cache(serverFetch);

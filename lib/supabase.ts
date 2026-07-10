import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ExpoSecureStoreAdapter = Platform.OS === 'web'
  ? {
      getItem: (key: string) => Promise.resolve(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null),
      setItem: (key: string, value: string) => { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); return Promise.resolve(); },
      removeItem: (key: string) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); return Promise.resolve(); },
    }
  : {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    };

const SUPABASE_URL = 'https://juilousufwlsiqdcgllu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1aWxvdXN1Zndsc2lxZGNnbGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MjE1MTEsImV4cCI6MjA5ODI5NzUxMX0.XOE0UTfZrfLp_giDlGkBsffhRBhVT1njaETm7vtmTxA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ─── Proactive refresh scheduler ─────────────────────────────────────────────

let _proactiveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProactiveRefresh(expiresAt: number): void {
  if (_proactiveTimer) clearTimeout(_proactiveTimer);
  const nowSeconds = Math.floor(Date.now() / 1000);
  // Fire 120s before expiry (widened from 60s — gives more headroom)
  const secondsUntilRefresh = Math.max(0, expiresAt - nowSeconds - 120);
  _proactiveTimer = setTimeout(async () => {
    _proactiveTimer = null;
    console.log('[supabase] Proactive token refresh triggered');
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.expires_at) {
        console.log('[supabase] Proactive token refresh succeeded');
        scheduleProactiveRefresh(data.session.expires_at);
      } else {
        console.log('[supabase] Proactive token refresh failed', error?.message);
      }
    } catch {
      // silent — getValidToken will handle it on next call
    }
  }, secondsUntilRefresh * 1000);
}

// Boot the scheduler as soon as the module loads
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session?.expires_at) scheduleProactiveRefresh(session.expires_at);
});

// Re-schedule on every token refresh event
supabase.auth.onAuthStateChange((event, session) => {
  if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.expires_at) {
    scheduleProactiveRefresh(session.expires_at);
  }
  if (event === 'SIGNED_OUT') {
    if (_proactiveTimer) { clearTimeout(_proactiveTimer); _proactiveTimer = null; }
    _refreshPromise = null; // clear stale promise so post-login fetches don't hang
  }
});

// ─── getValidToken ────────────────────────────────────────────────────────────

let _refreshPromise: Promise<string | null> | null = null;

// Exposed so AuthContext can store the foreground warm-up promise here,
// allowing fetchWithAuth to await it instead of starting a competing refresh.
export function setForegroundRefreshPromise(p: Promise<string | null>): void {
  if (!_refreshPromise) _refreshPromise = p.finally(() => { _refreshPromise = null; });
}

export function clearRefreshPromise(): void {
  _refreshPromise = null;
}

let _authFailureCallback: (() => void) | null = null;
export function registerAuthFailureCallback(fn: () => void): void {
  _authFailureCallback = fn;
}
function triggerAuthFailure(): void {
  console.log('[supabase] Session unrecoverable — triggering forced sign-out');
  _authFailureCallback?.();
}

export async function getValidToken(): Promise<string | null> {
  // If there is already an in-flight refresh (e.g. foreground warm-up), await it
  if (_refreshPromise) {
    console.log('[supabase] getValidToken: awaiting in-flight refresh promise');
    return _refreshPromise;
  }

  // Fast path — return cached token if it expires more than 120s from now
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const expiresAt = session.expires_at ?? 0;
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (expiresAt - nowSeconds > 120) {
        return session.access_token;
      }
    }
  } catch {
    // fall through to refresh
  }

  // Slow path — deduplicated refresh with 3 attempts
  if (!_refreshPromise) {
    console.log('[supabase] getValidToken: token near expiry, starting refresh');
    _refreshPromise = (async (): Promise<string | null> => {
      const delays = [0, 1000, 2000];
      for (let i = 0; i < delays.length; i++) {
        if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]));
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (!error && data.session?.access_token) {
            console.log('[supabase] getValidToken: refresh succeeded on attempt', i + 1);
            if (data.session.expires_at) scheduleProactiveRefresh(data.session.expires_at);
            return data.session.access_token;
          }
        } catch {
          // try next attempt
        }
      }
      console.log('[supabase] getValidToken: all refresh attempts failed');
      triggerAuthFailure();
      return null;
    })().finally(() => { _refreshPromise = null; });
  }

  return _refreshPromise;
}

// ─── Auth error detection ─────────────────────────────────────────────────────
// Supabase edge functions sometimes return 400/500 with an auth error body
// instead of a clean 401. Detect these so fetchWithAuth can retry them.

const AUTH_ERROR_PHRASES = [
  'invalid or expired token',
  'invalid jwt',
  'jwt expired',
  'not authenticated',
  'unauthorized',
  'missing authorization',
  'invalid token',
];

async function isAuthError(res: Response): Promise<boolean> {
  if (res.status === 401) return true;
  if (res.status === 403) return true;
  // For 400/500, peek at the body
  if (res.status === 400 || res.status === 500) {
    try {
      const text = await res.clone().text();
      const lower = text.toLowerCase();
      return AUTH_ERROR_PHRASES.some(phrase => lower.includes(phrase));
    } catch {
      return false;
    }
  }
  return false;
}

// ─── fetchWithAuth ────────────────────────────────────────────────────────────
// Drop-in replacement for fetch() for authenticated edge function calls.
// Retries on 401, 403, AND on any response body that contains an auth error
// phrase (handles edge functions that return 400/500 for expired tokens).

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  console.log('[fetchWithAuth] Request:', options.method ?? 'GET', url);
  const token = await getValidToken();
  if (!token) throw new Error('Not authenticated');

  const makeRequest = (t: string) => fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      'Authorization': `Bearer ${t}`,
    },
  });

  const res = await makeRequest(token);
  console.log('[fetchWithAuth] Response:', res.status, url);

  // Check for auth errors (including non-401 status codes with auth error bodies)
  if (await isAuthError(res)) {
    console.log('[fetchWithAuth] Auth error detected (status', res.status, '), retrying with fresh token');
    // Force a fresh refresh
    if (_refreshPromise) await _refreshPromise;
    const { data } = await supabase.auth.refreshSession();
    const newToken = data.session?.access_token;
    if (newToken) {
      if (data.session?.expires_at) scheduleProactiveRefresh(data.session.expires_at);
      const retryRes = await makeRequest(newToken);
      console.log('[fetchWithAuth] Retry response:', retryRes.status, url);
      return retryRes;
    } else {
      triggerAuthFailure(); // session unrecoverable after auth error
    }
  }

  return res;
}

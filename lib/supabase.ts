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
// Schedules a silent token refresh 60 seconds before the current token expires.
// Re-schedules itself on every successful refresh so the token is always warm.

let _proactiveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProactiveRefresh(expiresAt: number): void {
  if (_proactiveTimer) clearTimeout(_proactiveTimer);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const secondsUntilRefresh = Math.max(0, expiresAt - nowSeconds - 60);
  _proactiveTimer = setTimeout(async () => {
    _proactiveTimer = null;
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.expires_at) {
        scheduleProactiveRefresh(data.session.expires_at);
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
  }
});

// ─── getValidToken ────────────────────────────────────────────────────────────
// Always returns a valid access token.
// - Fast path: returns cached token if it expires >60s from now.
// - Slow path: refreshes with up to 3 attempts (0s, 1s, 2s gaps).
// - Never returns an expired token — returns null if all attempts fail.

let _refreshPromise: Promise<string | null> | null = null;

export async function getValidToken(): Promise<string | null> {
  // Fast path
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const expiresAt = session.expires_at ?? 0;
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (expiresAt - nowSeconds > 60) {
        return session.access_token;
      }
    }
  } catch {
    // fall through to refresh
  }

  // Slow path — deduplicated
  if (!_refreshPromise) {
    _refreshPromise = (async (): Promise<string | null> => {
      const delays = [0, 1000, 2000];
      for (let i = 0; i < delays.length; i++) {
        if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]));
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (!error && data.session?.access_token) {
            if (data.session.expires_at) scheduleProactiveRefresh(data.session.expires_at);
            return data.session.access_token;
          }
        } catch {
          // try next attempt
        }
      }
      // All attempts failed — return null, NOT the expired cached token
      return null;
    })().finally(() => { _refreshPromise = null; });
  }

  return _refreshPromise;
}

// ─── fetchWithAuth ────────────────────────────────────────────────────────────
// Drop-in replacement for fetch() for authenticated edge function calls.
// On a 401 response it force-refreshes the token and retries ONCE silently.
// Callers never see "Invalid or expired token" from a stale token.

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
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

  // On 401, force-refresh and retry once
  if (res.status === 401) {
    // Force a fresh refresh (bypass the fast-path cache)
    if (_refreshPromise) await _refreshPromise; // wait for any in-flight refresh
    const { data } = await supabase.auth.refreshSession();
    const newToken = data.session?.access_token;
    if (newToken) {
      if (data.session?.expires_at) scheduleProactiveRefresh(data.session.expires_at);
      return makeRequest(newToken);
    }
  }

  return res;
}

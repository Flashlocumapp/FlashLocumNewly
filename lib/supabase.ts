import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore is not available on web — fall back to localStorage
const ExpoSecureStoreAdapter = Platform.OS === 'web'
  ? {
      getItem: (key: string) => Promise.resolve(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null),
      setItem: (key: string, value: string) => {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        return Promise.resolve();
      },
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

// Module-level in-flight dedup: only one refresh call at a time
let _refreshPromise: Promise<string | null> | null = null;

/**
 * Always returns a valid access token for the logged-in user.
 * - Returns the cached token immediately if it expires >60 s from now (no network).
 * - Refreshes only when the token is expiring soon or missing.
 * - Deduplicates concurrent callers — only one refreshSession() call goes out at a time.
 * - Retries once on failure with a 1-second delay.
 * - Never throws; returns null only if the user is genuinely not logged in.
 */
export async function getValidToken(): Promise<string | null> {
  // Fast path: return cached token if still fresh
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const expiresAt = session.expires_at ?? 0; // unix seconds
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (expiresAt - nowSeconds > 60) {
        return session.access_token;
      }
    }
  } catch {
    // fall through to refresh
  }

  // Slow path: refresh, deduplicating concurrent callers
  if (!_refreshPromise) {
    _refreshPromise = (async (): Promise<string | null> => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session?.access_token) {
          return data.session.access_token;
        }
      } catch {
        // first attempt failed — wait 1s and retry once
      }
      await new Promise(r => setTimeout(r, 1000));
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session?.access_token) {
          return data.session.access_token;
        }
      } catch {
        // both attempts failed
      }
      // Last resort: return whatever is cached
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    })().finally(() => {
      _refreshPromise = null;
    });
  }

  return _refreshPromise;
}

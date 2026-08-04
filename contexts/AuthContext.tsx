import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import * as Location from 'expo-location';
import { IS_EXPO_GO } from '@/utils/expoGoGuard';
import { supabase, getValidToken, setForegroundRefreshPromise, clearRefreshPromise, registerAuthFailureCallback } from '@/lib/supabase';
import { AuthContextType, Profile } from '@/types';
import { clearAll } from '@/utils/tabCache';
import { triggerDispatchReset } from '@/contexts/DoctorDispatchContext';
import { SUPABASE_URL } from '@/constants/api';

// Module-level flag — resets on app restart, not on re-render
let _requesterSnapshotFiredThisSession = false;

// Module-level ref to track the currently logged-in OneSignal External ID
let _oneSignalExternalId: string | null = null;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Background recovery refs
  const backgroundedAtRef = useRef<number>(0);
  // Ref to the profile-verification channel so the AppState handler can inspect/re-subscribe it
  const profileChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    const MAX_ATTEMPTS = 3;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) await new Promise(r => setTimeout(r, 1000 * attempt));
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (!error && data) {
        setProfile(data as Profile);
        setProfileError(null);
        setProfileLoading(false);
        return;
      }
      lastError = error;
      console.log(`[AuthContext] fetchProfile attempt ${attempt} failed:`, (error as { message?: string })?.message);
    }
    console.log('[AuthContext] fetchProfile: all attempts failed', lastError);
    setProfile(null);
    setProfileError('Failed to load profile. Please check your connection.');
    setProfileLoading(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    // Safety net: if auth doesn't resolve in 10s, unblock the app
    const authTimeout = setTimeout(() => {
      setLoading(false);
      setIsReady(true);
    }, 10000);

    registerAuthFailureCallback(async () => {
      // Force sign-out — SIGNED_OUT event will route user to login via pathway guard
      clearRefreshPromise();
      clearAll();
      triggerDispatchReset();
      await supabase.auth.signOut();
      setProfile(null);
    });

    const subscribeProfileChannel = (userId: string): ReturnType<typeof supabase.channel> => {
      const ch = supabase
        .channel(`profile-verif-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${userId}`,
          },
          (payload) => {
            console.log('[AuthContext] profiles realtime UPDATE received', payload.new);
            const newStatus = (payload.new as Record<string, unknown>)?.verification_status;
            if (newStatus !== undefined) {
              setProfile((prev) => prev ? { ...prev, verification_status: newStatus as string | null } : prev);
            }
          }
        )
        .subscribe((status, err) => {
          console.log('[AuthContext] profile channel status:', status, err ?? '');
        });
      return ch;
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(authTimeout);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Wire OneSignal identity on session restore
        if (!IS_EXPO_GO && _oneSignalExternalId !== session.user.id) {
          _oneSignalExternalId = session.user.id;
          const { OneSignal } = require('react-native-onesignal');
          OneSignal.login(session.user.id);
          console.log('[AuthContext] OneSignal.login (session restore) userId=', session.user.id);
        }
        fetchProfile(session.user.id).finally(() => {
          setLoading(false);
          setIsReady(true);
        });
        // Set up realtime subscription and store in ref for AppState recovery
        const ch = subscribeProfileChannel(session.user.id);
        profileChannelRef.current = ch;
      } else {
        setProfileLoading(false);
        setLoading(false);
        setIsReady(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Only fetch profile on meaningful user-state changes — NOT on token refreshes
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
          // Wire OneSignal identity on sign-in / user update
          if (!IS_EXPO_GO && _oneSignalExternalId !== session.user.id) {
            _oneSignalExternalId = session.user.id;
            const { OneSignal } = require('react-native-onesignal');
            OneSignal.login(session.user.id);
            console.log('[AuthContext] OneSignal.login userId=', session.user.id);
          }
        } else {
          setProfile(null);
        }
        // Re-subscribe profile channel for the new user
        if (profileChannelRef.current) {
          supabase.removeChannel(profileChannelRef.current);
          profileChannelRef.current = null;
        }
        if (session?.user) {
          profileChannelRef.current = subscribeProfileChannel(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        // Unlink OneSignal identity on sign-out
        if (!IS_EXPO_GO && _oneSignalExternalId !== null) {
          _oneSignalExternalId = null;
          const { OneSignal } = require('react-native-onesignal');
          OneSignal.logout();
          console.log('[AuthContext] OneSignal.logout');
        }
        setSession(null);
        setUser(null);
        setProfile(null);
        if (profileChannelRef.current) {
          supabase.removeChannel(profileChannelRef.current);
          profileChannelRef.current = null;
        }
      } else {
        // TOKEN_REFRESHED, INITIAL_SESSION, PASSWORD_RECOVERY, etc.
        // Update session/user state but do NOT re-fetch profile — it hasn't changed
        setSession(session);
        // Only update user if the identity actually changed — avoids unnecessary re-renders on TOKEN_REFRESHED
        setUser(prev => {
          if (prev?.id === session?.user?.id) return prev; // same identity — keep stable reference
          return session?.user ?? null;
        });
      }
      setLoading(false);
    });

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        backgroundedAtRef.current = Date.now();
        console.log('[AuthContext] App backgrounded — recording timestamp');
      }

      if (nextState === 'active') {
        const elapsed = Date.now() - backgroundedAtRef.current;
        const FIVE_MINUTES = 5 * 60 * 1000;

        if (backgroundedAtRef.current > 0 && elapsed > FIVE_MINUTES) {
          console.log('[AuthContext] App foregrounded after', Math.round(elapsed / 1000), 's — running background recovery');

          // 1. Silently validate/refresh the auth token
          getValidToken().catch(() => {});

          // 2. Check profile channel health — re-subscribe if not SUBSCRIBED
          const ch = profileChannelRef.current;
          if (ch) {
            const state = ch.state;
            if (state !== 'joined') {
              console.log('[AuthContext] Profile channel not subscribed (state:', state, ') — re-subscribing');
              supabase.removeChannel(ch);
              profileChannelRef.current = null;
              const currentUser = (await supabase.auth.getSession()).data.session?.user;
              if (currentUser) {
                profileChannelRef.current = subscribeProfileChannel(currentUser.id);
              }
            }
          }
        } else {
          // Short foreground — just warm up the token as before
          console.log('[AuthContext] App foregrounded — checking session before warming up token');
          await new Promise(r => setTimeout(r, 500));
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (currentSession?.access_token) {
            console.log('[AuthContext] Session confirmed — warming up token');
            const p = getValidToken();
            setForegroundRefreshPromise(p);
            p.catch(() => {});
          } else {
            console.log('[AuthContext] No active session — skipping foreground warm-up');
          }
        }
      }
    };
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      clearTimeout(authTimeout);
      subscription.unsubscribe();
      appStateSubscription.remove();
      if (profileChannelRef.current) {
        supabase.removeChannel(profileChannelRef.current);
        profileChannelRef.current = null;
      }
    };
  }, [fetchProfile]);

  // Fire-and-forget area snapshot for requesters (analytics only)
  useEffect(() => {
    if (!user || profile?.role !== 'requester' || _requesterSnapshotFiredThisSession) return;
    _requesterSnapshotFiredThisSession = true;
    console.log('[area-snapshot] Firing requester area snapshot for user:', user.id);

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('[area-snapshot] Location permission denied — skipping snapshot');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude } = pos.coords;
        console.log('[area-snapshot] Got location, posting snapshot', { lat: latitude, lng: longitude });
        fetch(`${SUPABASE_URL}/functions/v1/area-snapshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id, role: 'requester', lat: latitude, lng: longitude }),
        }).catch((err) => console.warn('[area-snapshot] requester fire-and-forget failed:', err));
      } catch (err) {
        console.warn('[area-snapshot] requester location fetch failed (silent):', err);
      }
    })();
  }, [user, profile?.role]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string, metadata?: Record<string, string>) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    console.log('[AuthContext] signOut — clearing tab cache and dispatch state');
    clearRefreshPromise(); // prevent stale promise from blocking post-login fetches
    clearAll();
    triggerDispatchReset();
    // Unlink OneSignal identity before signing out
    if (!IS_EXPO_GO && _oneSignalExternalId !== null) {
      _oneSignalExternalId = null;
      const { OneSignal } = require('react-native-onesignal');
      OneSignal.logout();
      console.log('[AuthContext] OneSignal.logout (signOut)');
    }
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const contextValue = useMemo(() => ({
    session, user, profile, loading, profileLoading, profileError, isReady,
    signIn, signUp, signOut, refreshProfile,
  }), [session, user, profile, loading, profileLoading, profileError, isReady, signIn, signUp, signOut, refreshProfile]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase, getValidToken, setForegroundRefreshPromise, clearRefreshPromise, registerAuthFailureCallback } from '@/lib/supabase';
import { AuthContextType, Profile } from '@/types';
import { clearAll } from '@/utils/tabCache';
import { triggerDispatchReset } from '@/contexts/DoctorDispatchContext';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

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

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(authTimeout);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          setLoading(false);
          setIsReady(true);
        });
      } else {
        setLoading(false);
        setIsReady(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        // Session is already updated in the Supabase client's internal cache.
        // No action needed.
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    // Subscribe to verification_status changes on the doctor's own profiles row
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      const currentUser = currentSession?.user;
      if (!currentUser) return;
      profileChannel = supabase
        .channel(`profile-verif-${currentUser.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${currentUser.id}`,
          },
          (payload) => {
            console.log('[AuthContext] profiles realtime UPDATE received', payload.new);
            const newStatus = (payload.new as Record<string, unknown>)?.verification_status;
            if (newStatus !== undefined) {
              setProfile((prev) => prev ? { ...prev, verification_status: newStatus as string | null } : prev);
            }
          }
        )
        .subscribe();
    });

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[AuthContext] App foregrounded — checking session before warming up token');
        // Small delay to let any in-flight SIGNED_IN event clear _refreshPromise first
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
    };
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      clearTimeout(authTimeout);
      subscription.unsubscribe();
      appStateSubscription.remove();
      if (profileChannel) supabase.removeChannel(profileChannel);
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, metadata?: Record<string, string>) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
    return { error };
  };

  const signOut = async () => {
    console.log('[AuthContext] signOut — clearing tab cache and dispatch state');
    clearRefreshPromise(); // prevent stale promise from blocking post-login fetches
    clearAll();
    triggerDispatchReset();
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, profileLoading, profileError, isReady, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

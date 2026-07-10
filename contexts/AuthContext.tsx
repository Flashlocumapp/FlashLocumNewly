import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase, getValidToken, setForegroundRefreshPromise, clearRefreshPromise } from '@/lib/supabase';
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
  const [isReady, setIsReady] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) {
      setProfile(data as Profile);
    } else {
      setProfile(null);
    }
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

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[AuthContext] App foregrounded — warming up token');
        // Store the warm-up promise so fetchWithAuth can await it instead of racing
        const p = getValidToken();
        setForegroundRefreshPromise(p);
        p.catch(() => {});
      }
    };
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      clearTimeout(authTimeout);
      subscription.unsubscribe();
      appStateSubscription.remove();
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
    <AuthContext.Provider value={{ session, user, profile, loading, profileLoading, isReady, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';
import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { SystemBars } from 'react-native-edge-to-edge';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

// Prevent splash from auto-hiding before fonts + auth are ready
SplashScreen.preventAutoHideAsync().catch(() => {});

const LAST_PATHWAY_KEY = 'flashlocum_last_pathway';

const DevErrorBoundary = __DEV__
  ? ErrorBoundary
  : ({ children }: { children: React.ReactNode }) => <>{children}</>;

function NavigationGuard({ onNavigationReady }: { onNavigationReady: () => void }) {
  const { session, user, profile, isReady, profileLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [lastPathway, setLastPathway] = useState<'doctor' | 'requester' | null | undefined>(undefined);
  const [retryCount, setRetryCount] = useState(0);
  const hasRouted = useRef(false);
  const skipIntroRef = useRef(false);
  const routedWithNoSession = useRef(false);

  // Load last pathway from AsyncStorage once on mount
  useEffect(() => {
    SecureStore.getItemAsync(LAST_PATHWAY_KEY).then(val => {
      setLastPathway((val as 'doctor' | 'requester') ?? null);
    }).catch(() => setLastPathway(null));
  }, []);

  // Main routing effect — fires once when everything is ready
  useEffect(() => {
    if (!isReady || lastPathway === undefined) return;
    if (hasRouted.current) return;
    if (profileLoading) return; // wait for profile fetch to complete

    // Never interrupt the intro animation
    const onIntro = segments[1] === 'intro'; // segments[0] = '(auth)', segments[1] = 'intro'
    if (onIntro) return;

    hasRouted.current = true;
    onNavigationReady();

    const alreadyInOnboarding = segments[0] === '(onboarding)';
    if (alreadyInOnboarding) {
      return;
    }

    // 1. No session
    if (!session) {
      if (skipIntroRef.current) {
        // Sign-out path — go directly to role-select, no animation
        skipIntroRef.current = false;
        router.replace('/(auth)/role-select' as any);
      } else {
        // First launch / fresh sign-in — play the animation
        routedWithNoSession.current = true;
        router.replace('/(auth)/intro' as any);
      }
      return;
    }

    // 2. Session but no profile
    if (!profile) {
      const metaRole = user?.user_metadata?.role;
      const route = metaRole === 'requester'
        ? '/(onboarding)/requester/basic-profile'
        : '/(onboarding)/doctor/basic-profile';
      router.replace(route as any);
      return;
    }

    const doctorComplete = profile.doctor_onboarding_complete === true;
    const requesterComplete = profile.requester_onboarding_complete === true;

    // 3. Neither onboarding complete
    if (!doctorComplete && !requesterComplete) {
      if (profile.role === 'doctor') {
        // Resume doctor at the correct step
        if (!profile.doctor_basic_profile_complete) {
          // Never completed Step 1
          console.log('[NavigationGuard] Doctor resuming at Step 1 (basic-profile)');
          router.replace('/(onboarding)/doctor/basic-profile' as any);
        } else {
          // Step 1 done — check if Step 2 (credentials) is done
          // by querying doctor_profiles for mdcn_number
          console.log('[NavigationGuard] Doctor Step 1 complete, querying doctor_profiles for Step 2 status');
          supabase
            .from('doctor_profiles')
            .select('mdcn_number')
            .eq('id', profile.id)
            .single()
            .then(({ data }) => {
              if (!data?.mdcn_number) {
                // Step 2 not done
                console.log('[NavigationGuard] Doctor resuming at Step 2 (credentials)');
                router.replace('/(onboarding)/doctor/credentials' as any);
              } else {
                // Step 2 done, Step 3 not done
                console.log('[NavigationGuard] Doctor resuming at Step 3 (payout)');
                router.replace('/(onboarding)/doctor/payout' as any);
              }
            });
        }
      } else {
        router.replace('/(onboarding)/requester/basic-profile' as any);
      }
      return;
    }

    // 4. Doctor only complete
    if (doctorComplete && !requesterComplete) {
      const homeDest = '/(doctor)/(home)';
      const encodedDest = encodeURIComponent(homeDest);
      router.replace(`/(auth)/intro?dest=${encodedDest}` as any);
      return;
    }

    // 5. Requester only complete
    if (requesterComplete && !doctorComplete) {
      const homeDest = '/(requester)/(home)';
      const encodedDest = encodeURIComponent(homeDest);
      router.replace(`/(auth)/intro?dest=${encodedDest}` as any);
      return;
    }

    // 6. Both complete — use last pathway, then write it back
    const dest = lastPathway === 'doctor' ? '/(doctor)/(home)' : '/(requester)/(home)';
    const pathway = lastPathway === 'doctor' ? 'doctor' : 'requester';
    SecureStore.setItemAsync(LAST_PATHWAY_KEY, pathway).catch(() => {});
    const encodedDest = encodeURIComponent(dest);
    router.replace(`/(auth)/intro?dest=${encodedDest}` as any);
  }, [isReady, lastPathway, session, profile, profileLoading, segments, retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Session-arrival watcher — if we routed with no session and session later arrives, re-run routing
  useEffect(() => {
    if (!routedWithNoSession.current) return;
    // Only act if the user is still in the auth/intro flow waiting for a session.
    // If they've already navigated to a portal or onboarding on their own, do nothing.
    if (segments[0] === '(auth)') return;
    if (segments[0] === '(doctor)') return;
    if (segments[0] === '(requester)') return;
    if (segments[0] === '(onboarding)') return;
    if (!session || !profile || profileLoading) return;
    if (lastPathway === undefined) return;
    console.log('[NavigationGuard] Session arrived after no-session route — retrying routing');
    routedWithNoSession.current = false;
    hasRouted.current = false;
    setRetryCount(c => c + 1);
  }, [session, profile, profileLoading, lastPathway, segments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sign-out watcher — only reset after session AND profile are both gone
  useEffect(() => {
    if (!session && !profile && hasRouted.current) {
      routedWithNoSession.current = false; // clear stale flag on sign-out
      if (segments[0] === '(auth)') return; // already in auth flow — don't redirect
      hasRouted.current = false;
      skipIntroRef.current = true;
      router.replace('/(auth)/role-select' as any);
    }
  }, [session, profile, segments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-portal redirect guard — fires on segment changes after initial routing
  useEffect(() => {
    if (!isReady || !hasRouted.current || !profile) return;
    const doctorComplete = profile.doctor_onboarding_complete === true;
    const requesterComplete = profile.requester_onboarding_complete === true;
    const inDoctor = segments[0] === '(doctor)';
    const inRequester = segments[0] === '(requester)';

    if (inDoctor && !doctorComplete && requesterComplete) {
      router.replace('/(requester)/(home)' as any);
    } else if (inRequester && !requesterComplete && doctorComplete) {
      router.replace('/(doctor)/(home)' as any);
    }
  }, [segments, isReady, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function RootLayoutInner({ onNavigationReady }: { onNavigationReady: () => void }) {
  return (
    <ThemeProvider value={DarkTheme}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#111315' }}>
          <NavigationGuard onNavigationReady={onNavigationReady} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(doctor)" />
            <Stack.Screen name="(requester)" />
          </Stack>
          <SystemBars style="auto" />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [navigationReady, setNavigationReady] = useState(false);

  // Hide splash only when BOTH fonts are loaded AND navigation has resolved auth state.
  useEffect(() => {
    if (!fontsLoaded || !navigationReady) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, navigationReady]);

  // Safety-net: hide after 8s in case NavigationGuard never fires (e.g. error path).
  useEffect(() => {
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded) return null;

  return (
    <DevErrorBoundary>
      <AuthProvider>
        <NotificationProvider>
          <RootLayoutInner onNavigationReady={() => setNavigationReady(true)} />
        </NotificationProvider>
      </AuthProvider>
    </DevErrorBoundary>
  );
}

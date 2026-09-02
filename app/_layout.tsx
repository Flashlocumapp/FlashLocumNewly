import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { SystemBars } from 'react-native-edge-to-edge';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { NotificationProvider, useNotifications } from "@/contexts/NotificationContext";
import { ErrorBoundary } from '@/components/ErrorBoundary';
import InAppNotificationBanner from '@/components/InAppNotificationBanner';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

// preventAutoHideAsync is called in index.ts as the very first import.
// Calling it here a second time is harmless but redundant — removed.

const LAST_PATHWAY_KEY = 'flashlocum_last_pathway';

export const SplashContext = React.createContext<{
  signalScreenReady: () => void;
  splashDismissed: boolean;
  splashMinMs: number;
}>({
  signalScreenReady: () => {},
  splashDismissed: false,
  splashMinMs: 3000,
});
export function useSplash() { return React.useContext(SplashContext); }

const DevErrorBoundary = ErrorBoundary;

function PortalErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 18, fontWeight: '600', color: '#1a1a1a', textAlign: 'center', marginBottom: 12 }}>
        Something went wrong
      </Text>
      <Text style={{ fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>
        An unexpected error occurred. Please try again.
      </Text>
      <Pressable
        onPress={onRetry}
        style={{ backgroundColor: '#007AFF', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10 }}
      >
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Try Again</Text>
      </Pressable>
    </View>
  );
}

function NavigationGuard({
  onNavigationReady,
  onReturningUser,
}: {
  onNavigationReady: () => void;
  onReturningUser: (val: boolean) => void;
}) {
  const { session, user, profile, isReady, profileLoading, profileError } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [lastPathway, setLastPathway] = useState<'doctor' | 'requester' | null | undefined>(undefined);
  const [retryCount, setRetryCount] = useState(0);
  const hasRouted = useRef(false);
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
    if (!profile && profileLoading) return; // wait for profile fetch only if we don't have one yet

    // Never interrupt the intro animation
    const onIntro = segments[1] === 'intro'; // segments[0] = '(auth)', segments[1] = 'intro'
    if (onIntro) return;

    const alreadyInOnboarding = segments[0] === '(onboarding)';
    if (alreadyInOnboarding) {
      // Already on an onboarding screen — signal navigation ready and stop
      hasRouted.current = true;
      onNavigationReady();
      return;
    }

    // 1. No session → play intro animation, then land on role-select
    if (!session) {
      hasRouted.current = true;
      routedWithNoSession.current = true;
      router.replace('/(auth)/intro?dest=%2F(auth)%2Frole-select' as any);
      onNavigationReady();
      return;
    }

    // 2. Session but no profile
    if (!profile) {
      hasRouted.current = true;
      if (profileError) {
        // Profile fetch failed after all retries — we cannot determine role or onboarding state.
        // Route to role-select. Do NOT infer onboarding state from a failed query.
        console.log('[NavigationGuard] Profile fetch failed — routing to role-select');
        router.replace('/(auth)/role-select' as any);
      } else {
        // No profile row exists — genuinely new user. Route to onboarding based on metadata role.
        const metaRole = user?.user_metadata?.role;
        const route = metaRole === 'requester'
          ? '/(onboarding)/requester/basic-profile'
          : '/(onboarding)/doctor/basic-profile';
        console.log('[NavigationGuard] No profile row — new user, routing to', route);
        router.replace(route as any);
      }
      onNavigationReady();
      return;
    }

    const doctorComplete = profile.doctor_onboarding_complete === true;
    const requesterComplete = profile.requester_onboarding_complete === true;

    // 3. Neither onboarding complete
    if (!doctorComplete && !requesterComplete) {
      hasRouted.current = true;
      if (profile.role === 'doctor') {
        if (!profile.doctor_basic_profile_complete) {
          console.log('[NavigationGuard] Doctor resuming at Step 1 (basic-profile)');
          router.replace('/(onboarding)/doctor/basic-profile' as any);
          onNavigationReady();
        } else {
          console.log('[NavigationGuard] Doctor Step 1 complete, querying doctor_profiles for Step 2 status');
          Promise.resolve(
            supabase
              .from('doctor_profiles')
              .select('mdcn_number')
              .eq('id', profile.id)
              .single()
          ).then(({ data }) => {
            if (!data?.mdcn_number) {
              console.log('[NavigationGuard] Doctor resuming at Step 2 (credentials)');
              router.replace('/(onboarding)/doctor/credentials' as any);
            } else {
              console.log('[NavigationGuard] Doctor resuming at Step 3 (payout)');
              router.replace('/(onboarding)/doctor/payout' as any);
            }
            onNavigationReady(); // called AFTER router.replace, inside the async callback
          }).catch(() => {
            // doctor_profiles query failed. We already know doctor_basic_profile_complete === true
            // from the successfully fetched main profile. A query failure is not evidence that
            // Step 1 is incomplete. Route to role-select so the user can re-enter their pathway
            // and the step detection will re-run with fresh data.
            console.log('[NavigationGuard] doctor_profiles query failed — routing to role-select (not basic-profile)');
            router.replace('/(auth)/role-select' as any);
            onNavigationReady();
          });
        }
      } else {
        router.replace('/(onboarding)/requester/basic-profile' as any);
        onNavigationReady();
      }
      return;
    }

    // Returning user: valid session + lastPathway already set → skip intro animation,
    // route directly to portal. Splash minimum becomes 5s (set via onReturningUser).
    // New/first-time users (lastPathway === null) still get the intro animation.
    const isReturningUser = !!session && !!lastPathway;
    onReturningUser(isReturningUser);

    hasRouted.current = true;

    // 4. Doctor only complete
    if (doctorComplete && !requesterComplete) {
      if (isReturningUser) {
        router.replace('/(doctor)/(home)' as any);
      } else {
        router.replace(`/(auth)/intro?dest=${encodeURIComponent('/(doctor)/(home)')}` as any);
      }
      onNavigationReady();
      return;
    }

    // 5. Requester only complete
    if (requesterComplete && !doctorComplete) {
      if (isReturningUser) {
        router.replace('/(requester)/(home)' as any);
      } else {
        router.replace(`/(auth)/intro?dest=${encodeURIComponent('/(requester)/(home)')}` as any);
      }
      onNavigationReady();
      return;
    }

    // 6. Both complete — use last pathway, then write it back
    const dest = lastPathway === 'doctor' ? '/(doctor)/(home)' : '/(requester)/(home)';
    const pathway = lastPathway === 'doctor' ? 'doctor' : 'requester';
    SecureStore.setItemAsync(LAST_PATHWAY_KEY, pathway).catch(() => {});
    if (isReturningUser) {
      router.replace(dest as any);
    } else {
      router.replace(`/(auth)/intro?dest=${encodeURIComponent(dest)}` as any);
    }
    onNavigationReady();
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
      if (segments[0] === '(auth)') return;   // already in auth flow — don't redirect
      if (segments[0] === '') return;          // router not committed yet — don't interrupt cold launch
      if (segments[0] === 'index') return;     // still on index screen — don't interrupt cold launch
      hasRouted.current = false;
      // Clear lastPathway so the next cold launch plays the intro animation
      SecureStore.deleteItemAsync(LAST_PATHWAY_KEY).catch(() => {});
      // Go directly to role-select — no intro on immediate sign-out.
      // The intro plays on the NEXT cold launch (unauthenticated cold launch path above).
      router.replace('/(auth)/role-select' as any);
    }
  }, [session, profile, segments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-portal redirect guard — fires on segment changes after initial routing
  useEffect(() => {
    if (!isReady || !hasRouted.current || !profile) return;
    const onIntro = segments[0] === '(auth)' && segments[1] === 'intro';
    if (onIntro) return; // never interrupt intro animation
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

const FlashLocumTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#111315',
    card: '#111315',
  },
};

function RootLayoutInner({
  onNavigationReady,
  onReturningUser,
}: {
  onNavigationReady: () => void;
  onReturningUser: (val: boolean) => void;
}) {
  const { inAppNotification, dismissInAppNotification } = useNotifications();

  return (
    <ThemeProvider value={FlashLocumTheme}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#111315' }}>
          <View style={{ flex: 1 }}>
            <NavigationGuard onNavigationReady={onNavigationReady} onReturningUser={onReturningUser} />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="(doctor)" />
              <Stack.Screen name="(requester)" />
            </Stack>
            <InAppNotificationBanner
              notification={inAppNotification}
              onDismiss={dismissInAppNotification}
            />
          </View>
          <SystemBars style="auto" />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  console.log('[AppEntry] RootLayout mounted');
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [navigationReady, setNavigationReady] = useState(false);
  const [screenReady, setScreenReady] = useState(false);
  const [splashDismissed, setSplashDismissed] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false);

  // APP_START is stamped at module evaluation time — the earliest JS anchor available.
  // This gives MAX(3s from launch, readiness) semantics:
  //   - If everything ready in 1s: elapsed=1000, remaining=2000 → hides at 3s ✅
  //   - If everything ready in 4s: elapsed=4000, remaining=0   → hides immediately ✅
  // Loading happens DURING the 3-second splash, not before an additional 3-second hold.
  const APP_START = useRef(Date.now()).current;

  useEffect(() => {
    // All four conditions must be true before the splash may hide:
    // 1. fontsLoaded    — Inter fonts available (no FOUT on intro screen)
    // 2. navigationReady — NavigationGuard resolved auth+profile, router.replace('/(auth)/intro') called
    // 3. screenReady    — IntroScreen useFocusEffect fired (screen mounted and focused)
    // 4. 3000ms minimum — from APP_START (JS launch time)
    if (!fontsLoaded || !navigationReady || !screenReady) return;
    const splashMinMs = isReturningUser ? 5000 : 3000;
    const elapsed = Date.now() - APP_START;
    const remaining = Math.max(0, splashMinMs - elapsed);
    const timer = setTimeout(() => {
      SplashScreen.hideAsync()
        .catch(() => {})
        .finally(() => setSplashDismissed(true));
    }, remaining);
    return () => clearTimeout(timer);
  }, [fontsLoaded, navigationReady, screenReady, APP_START, isReturningUser]);

  if (!fontsLoaded) return null;

  return (
    <KeyboardProvider>
      <SplashContext.Provider value={{ signalScreenReady: () => setScreenReady(true), splashDismissed, splashMinMs: isReturningUser ? 5000 : 3000 }}>
        <DevErrorBoundary>
          <AuthProvider>
            <NotificationProvider>
              <RootLayoutInner
                onNavigationReady={() => setNavigationReady(true)}
                onReturningUser={setIsReturningUser}
              />
            </NotificationProvider>
          </AuthProvider>
        </DevErrorBoundary>
      </SplashContext.Provider>
    </KeyboardProvider>
  );
}

import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';
import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { SystemBars } from 'react-native-edge-to-edge';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

// Prevent splash from auto-hiding before fonts + auth are ready
SplashScreen.preventAutoHideAsync().catch(() => {});

const LAST_PATHWAY_KEY = 'flashlocum_last_pathway';

const DevErrorBoundary = __DEV__
  ? ErrorBoundary
  : ({ children }: { children: React.ReactNode }) => <>{children}</>;

function NavigationGuard() {
  const { session, user, profile, isReady, profileLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [lastPathway, setLastPathway] = useState<'doctor' | 'requester' | null | undefined>(undefined);
  const hasRouted = useRef(false);

  // Load last pathway from AsyncStorage once on mount
  useEffect(() => {
    AsyncStorage.getItem(LAST_PATHWAY_KEY).then(val => {
      console.log('[NavigationGuard] Loaded last pathway from storage:', val);
      setLastPathway((val as 'doctor' | 'requester') ?? null);
    }).catch(() => setLastPathway(null));
  }, []);

  // Main routing effect — fires once when everything is ready
  useEffect(() => {
    if (!isReady || lastPathway === undefined) return;
    if (hasRouted.current) return;
    if (profileLoading) return; // wait for profile fetch to complete

    hasRouted.current = true;
    SplashScreen.hideAsync();
    console.log('[NavigationGuard] Routing — session:', !!session, 'profile:', !!profile, 'lastPathway:', lastPathway);

    const alreadyInOnboarding = segments[0] === '(onboarding)';
    if (alreadyInOnboarding) {
      console.log('[NavigationGuard] Already in onboarding — skipping re-route');
      return;
    }

    // 1. No session
    if (!session) {
      console.log('[NavigationGuard] No session → /(auth)/intro');
      router.replace('/(auth)/intro' as any);
      return;
    }

    // 2. Session but no profile
    if (!profile) {
      const metaRole = user?.user_metadata?.role;
      const route = metaRole === 'requester'
        ? '/(onboarding)/requester/basic-profile'
        : '/(onboarding)/doctor/basic-profile';
      console.log('[NavigationGuard] No profile → onboarding via metadata role:', metaRole, '→', route);
      router.replace(route as any);
      return;
    }

    const doctorComplete = profile.doctor_onboarding_complete === true;
    const requesterComplete = profile.requester_onboarding_complete === true;

    // 3. Neither onboarding complete
    if (!doctorComplete && !requesterComplete) {
      const route = profile.role === 'doctor'
        ? '/(onboarding)/doctor/basic-profile'
        : '/(onboarding)/requester/basic-profile';
      console.log('[NavigationGuard] Neither complete → onboarding:', route);
      router.replace(route as any);
      return;
    }

    // 4. Doctor only complete
    if (doctorComplete && !requesterComplete) {
      console.log('[NavigationGuard] Doctor only → /(doctor)/(home)');
      router.replace('/(doctor)/(home)' as any);
      return;
    }

    // 5. Requester only complete
    if (requesterComplete && !doctorComplete) {
      console.log('[NavigationGuard] Requester only → /(requester)/(home)');
      router.replace('/(requester)/(home)' as any);
      return;
    }

    // 6. Both complete — use last pathway, then write it back
    const dest = lastPathway === 'doctor' ? '/(doctor)/(home)' : '/(requester)/(home)';
    const pathway = lastPathway === 'doctor' ? 'doctor' : 'requester';
    AsyncStorage.setItem(LAST_PATHWAY_KEY, pathway).catch(() => {});
    console.log('[NavigationGuard] Both complete → last pathway:', dest);
    router.replace(dest as any);
  }, [isReady, lastPathway, session, profile, profileLoading]);

  // Sign-out watcher — only reset after session AND profile are both gone
  useEffect(() => {
    if (!session && !profile && hasRouted.current) {
      console.log('[NavigationGuard] Session + profile both gone — resetting and going to intro');
      hasRouted.current = false;
      router.replace('/(auth)/intro' as any);
    }
  }, [session, profile]);

  // Cross-portal redirect guard — fires on segment changes after initial routing
  useEffect(() => {
    if (!isReady || !hasRouted.current || !profile) return;
    const doctorComplete = profile.doctor_onboarding_complete === true;
    const requesterComplete = profile.requester_onboarding_complete === true;
    const inDoctor = segments[0] === '(doctor)';
    const inRequester = segments[0] === '(requester)';

    if (inDoctor && !doctorComplete && requesterComplete) {
      console.log('[NavigationGuard] Cross-portal block: requester in doctor route → redirecting');
      router.replace('/(requester)/(home)' as any);
    } else if (inRequester && !requesterComplete && doctorComplete) {
      console.log('[NavigationGuard] Cross-portal block: doctor in requester route → redirecting');
      router.replace('/(doctor)/(home)' as any);
    }
  }, [segments, isReady, profile]);

  return null;
}

function RootLayoutInner() {
  return (
    <ThemeProvider value={DarkTheme}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#111315' }}>
          <NavigationGuard />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
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

  // Module-level preventAutoHideAsync handles the initial call.
  // This safety net hides the splash if NavigationGuard doesn't fire within 5s.
  useEffect(() => {
    if (!fontsLoaded) return;
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <DevErrorBoundary>
      <AuthProvider>
        <RootLayoutInner />
      </AuthProvider>
    </DevErrorBoundary>
  );
}

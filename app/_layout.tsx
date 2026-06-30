import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';
import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { SystemBars } from 'react-native-edge-to-edge';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const LAST_PATHWAY_KEY = 'flashlocum_last_pathway';

const DevErrorBoundary = __DEV__
  ? ErrorBoundary
  : ({ children }: { children: React.ReactNode }) => <>{children}</>;

function NavigationGuard() {
  const { session, profile, isReady } = useAuth();
  const router = useRouter();
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

    hasRouted.current = true;
    SplashScreen.hideAsync();
    console.log('[NavigationGuard] Routing — session:', !!session, 'profile:', !!profile, 'lastPathway:', lastPathway);

    // 1. No session
    if (!session) {
      console.log('[NavigationGuard] No session → /(auth)/intro');
      router.replace('/(auth)/intro' as any);
      return;
    }

    // 2. Session but no profile
    if (!profile) {
      console.log('[NavigationGuard] No profile → onboarding');
      router.replace('/(onboarding)/doctor/basic-profile' as any);
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

    // 6. Both complete — use last pathway
    const dest = lastPathway === 'requester' ? '/(requester)/(home)' : '/(doctor)/(home)';
    console.log('[NavigationGuard] Both complete → last pathway:', dest);
    router.replace(dest as any);
  }, [isReady, lastPathway, session, profile]);

  // Sign-out watcher — reset hasRouted so next sign-in re-routes
  useEffect(() => {
    if (!session && hasRouted.current) {
      console.log('[NavigationGuard] Session lost after routing — resetting and going to intro');
      hasRouted.current = false;
      router.replace('/(auth)/intro' as any);
    }
  }, [session]);

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
  return (
    <DevErrorBoundary>
      <AuthProvider>
        <RootLayoutInner />
      </AuthProvider>
    </DevErrorBoundary>
  );
}

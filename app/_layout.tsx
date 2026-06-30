import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { SystemBars } from 'react-native-edge-to-edge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const LAST_PATHWAY_KEY = 'flashlocum_last_pathway';

const DevErrorBoundary = __DEV__
  ? ErrorBoundary
  : ({ children }: { children: React.ReactNode }) => <>{children}</>;

function NavigationGuard() {
  const { session, loading, profile, profileLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [lastPathway, setLastPathway] = useState<'doctor' | 'requester' | null | undefined>(undefined);

  // Load last pathway from AsyncStorage once on mount
  useEffect(() => {
    AsyncStorage.getItem(LAST_PATHWAY_KEY).then(val => {
      console.log('[NavigationGuard] Loaded last pathway from storage:', val);
      setLastPathway((val as 'doctor' | 'requester') ?? null);
    }).catch(() => setLastPathway(null));
  }, []);

  useEffect(() => {
    // Wait for all loading to finish AND lastPathway to be read
    if (loading || profileLoading || lastPathway === undefined) return;
    if (!session) return;

    const seg0 = segments[0] as string | undefined;
    const inAuth = seg0 === '(auth)';
    const inOnboarding = seg0 === '(onboarding)';
    const inIndex = seg0 === 'index' || seg0 === undefined;
    const inDoctor = seg0 === '(doctor)';
    const inRequester = seg0 === '(requester)';

    // Session exists but profile not yet created — send to onboarding
    if (!profile) {
      if (!inOnboarding) {
        console.log('[NavigationGuard] Session but no profile, routing to onboarding');
        router.replace('/(onboarding)/doctor/basic-profile' as any);
      }
      return;
    }

    const doctorComplete = profile.doctor_onboarding_complete === true;
    const requesterComplete = profile.requester_onboarding_complete === true;
    const eitherComplete = doctorComplete || requesterComplete;

    if (!eitherComplete) {
      if (!inOnboarding) {
        const route = profile.role === 'doctor'
          ? '/(onboarding)/doctor/basic-profile'
          : '/(onboarding)/requester/basic-profile';
        console.log('[NavigationGuard] No pathway complete, routing to onboarding:', route);
        router.replace(route as any);
      }
      return;
    }

    // Doctor only complete
    if (doctorComplete && !requesterComplete) {
      if (!inDoctor) {
        console.log('[NavigationGuard] Doctor only, routing to doctor home');
        router.replace('/(doctor)/(home)' as any);
      }
      return;
    }

    // Requester only complete
    if (requesterComplete && !doctorComplete) {
      if (!inRequester) {
        console.log('[NavigationGuard] Requester only, routing to requester home');
        router.replace('/(requester)/(home)' as any);
      }
      return;
    }

    // Both complete — use last pathway, default to doctor
    if (doctorComplete && requesterComplete) {
      if (inAuth || inIndex) {
        const dest = lastPathway === 'requester'
          ? '/(requester)/(home)'
          : '/(doctor)/(home)';
        console.log('[NavigationGuard] Both complete, routing to last pathway:', dest);
        router.replace(dest as any);
      }
      return;
    }
  }, [session, loading, profile, profileLoading, segments, lastPathway]);

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

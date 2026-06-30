import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';
import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { SystemBars } from 'react-native-edge-to-edge';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const DevErrorBoundary = __DEV__
  ? ErrorBoundary
  : ({ children }: { children: React.ReactNode }) => <>{children}</>;

function NavigationGuard() {
  const { session, loading, profile, profileLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || profileLoading) return;
    if (!session) return;

    const seg0 = segments[0] as string | undefined;
    const inAuth = seg0 === '(auth)';
    const inOnboarding = seg0 === '(onboarding)';
    const inIndex = seg0 === 'index' || seg0 === undefined;
    const inDoctor = seg0 === '(doctor)';
    const inRequester = seg0 === '(requester)';

    // Session exists but profile not yet created/loaded — send to onboarding
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
        console.log('[NavigationGuard] Doctor only complete, routing to doctor home');
        router.replace('/(doctor)/(home)' as any);
      }
      return;
    }

    // Requester only complete
    if (requesterComplete && !doctorComplete) {
      if (!inRequester) {
        console.log('[NavigationGuard] Requester only complete, routing to requester home');
        router.replace('/(requester)/(home)' as any);
      }
      return;
    }

    // Both complete — hub is valid, but only redirect if in auth/index
    if (doctorComplete && requesterComplete) {
      if (inAuth || inIndex) {
        console.log('[NavigationGuard] Both pathways complete, routing to hub');
        router.replace('/(app)/(home)' as any);
      }
      return;
    }
  }, [session, loading, profile, profileLoading, segments]);

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

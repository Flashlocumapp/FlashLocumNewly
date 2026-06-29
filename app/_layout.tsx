import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';
import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
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

    const seg0 = segments[0] as string | undefined;
    const inAuth = seg0 === '(auth)';
    const inOnboarding = seg0 === '(onboarding)';
    const inIndex = seg0 === 'index' || seg0 === undefined;

    // No session — index.tsx owns this routing
    if (!session) return;

    // Has session + onboarding incomplete → onboarding
    if (session && profile && !profile.onboarding_complete) {
      if (!inOnboarding) {
        const route = profile.role === 'doctor'
          ? '/(onboarding)/doctor/basic-profile'
          : '/(onboarding)/requester/basic-profile';
        router.replace(route as any);
      }
      return;
    }

    // Has session + onboarding complete → app
    if (session && profile?.onboarding_complete) {
      if (inAuth || inOnboarding || inIndex) {
        router.replace('/(app)/(home)');
      }
      return;
    }

    // Has session but profile not yet loaded (new signup, profile row being created)
    if (session && !profile && !profileLoading) {
      if (inAuth) {
        // Stay put — profile will load shortly via onAuthStateChange
      }
    }
  }, [session, loading, profile, profileLoading, segments]);

  return null;
}

function RootLayoutInner() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <NavigationGuard />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="(onboarding)" />
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

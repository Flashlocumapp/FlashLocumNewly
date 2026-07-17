import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, Animated, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { TabBarVisibilityContext, TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { setCached, isStale } from '@/utils/tabCache';

const REQUESTER_TABS = [
  { name: '(home)',     route: '/(requester)/(home)'     as const, icon: 'home'           as const, label: 'Home'     },
  { name: '(coverage)', route: '/(requester)/(coverage)' as const, icon: 'calendar-month' as const, label: 'Coverage' },
  { name: '(account)',  route: '/(requester)/(account)'  as const, icon: 'person'         as const, label: 'Account'  },
];

export default function RequesterLayout() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const tabBarAnim = useRef(new Animated.Value(0)).current;
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!user) return;
    console.log('[RequesterLayout] Starting background prefetch for user:', user.id);
    // Fire-and-forget background prefetch — never blocks the home screen
    void (async () => {
      await Promise.allSettled([
        // 1. Requester Coverage history
        (async () => {
          const key = `requester-coverage-${user.id}`;
          if (!isStale(key)) return;
          try {
            console.log('[RequesterLayout] Prefetching coverage sessions, key:', key);
            const res = await fetchWithAuth(
              'https://juilousufwlsiqdcgllu.supabase.co/functions/v1/get-coverage-sessions?role=requester&status=completed,cancelled,requester_paid',
              { headers: { 'Content-Type': 'application/json' } }
            );
            if (!res.ok) return;
            const data = await res.json();
            setCached(key, data?.sessions ?? []);
            console.log('[RequesterLayout] Coverage sessions cached, count:', (data?.sessions ?? []).length);
          } catch {}
        })(),
        // 2. Requester Account profile
        (async () => {
          const key = 'requester_profile';
          if (!isStale(key)) return;
          try {
            console.log('[RequesterLayout] Prefetching account profile, key:', key);
            const { data } = await supabase
              .from('profiles')
              .select('first_name, last_name, phone, gender')
              .eq('id', user.id)
              .single();
            if (!data) return;
            const merged = {
              first_name: profile?.first_name ?? data.first_name ?? null,
              last_name: profile?.last_name ?? data.last_name ?? null,
              phone: profile?.phone ?? data.phone ?? null,
              gender: profile?.gender ?? data.gender ?? null,
            };
            setCached(key, merged);
            console.log('[RequesterLayout] Account profile cached:', merged.first_name, merged.last_name);
          } catch {}
        })(),
      ]);
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const TAB_BAR_TOTAL = TAB_BAR_HEIGHT + insets.bottom;

  const setTabBarVisible = (visible: boolean) => {
    Animated.timing(tabBarAnim, {
      toValue: visible ? 0 : TAB_BAR_TOTAL,
      duration: 260,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TabBarVisibilityContext.Provider value={{ setTabBarVisible }}>
      <View style={{ flex: 1, backgroundColor: '#F9F9F6' }}>
        <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
          <Stack.Screen name="(home)" />
          <Stack.Screen name="(coverage)" />
          <Stack.Screen name="(account)" />
        </Stack>

        {Platform.OS !== 'ios' && (
          <Animated.View style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            transform: [{ translateY: tabBarAnim }],
          }}>
            <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#F9F9F6', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
              <View style={{ flexDirection: 'row', backgroundColor: '#F9F9F6', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                {REQUESTER_TABS.map((tab) => {
                  const isActive = (segments as string[]).includes(tab.name);
                  return (
                    <Pressable
                      key={tab.name}
                      onPress={() => {
                        if (isActive) return; // already on this tab — do nothing
                        console.log('[RequesterTabBar] Tab pressed:', tab.route);
                        router.replace(tab.route);
                      }}
                      android_ripple={{ color: 'transparent' }}
                      style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 10, opacity: 1 })}
                    >
                      <MaterialIcons name={tab.icon} size={24} color={isActive ? '#1C1C1E' : '#8E8E93'} />
                      <Text style={{ fontSize: 10, fontWeight: isActive ? '600' : '400', color: isActive ? '#1C1C1E' : '#8E8E93', marginTop: 3 }}>
                        {tab.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </SafeAreaView>
          </Animated.View>
        )}
      </View>
    </TabBarVisibilityContext.Provider>
  );
}

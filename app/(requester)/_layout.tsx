import React, { useRef } from 'react';
import { View, Text, Pressable, Animated, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { TabBarVisibilityContext, TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';

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
  const TAB_BAR_TOTAL = TAB_BAR_HEIGHT + insets.bottom;

  const setTabBarVisible = (visible: boolean) => {
    console.log('[RequesterLayout] setTabBarVisible:', visible);
    Animated.timing(tabBarAnim, {
      toValue: visible ? 0 : TAB_BAR_TOTAL,
      duration: 260,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TabBarVisibilityContext.Provider value={{ setTabBarVisible }}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(home)" />
          <Stack.Screen name="(coverage)" />
          <Stack.Screen name="(account)" />
        </Stack>

        {Platform.OS !== 'ios' && (
          <Animated.View style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            backgroundColor: '#F9F9F6',
            flexDirection: 'row',
            paddingBottom: insets.bottom,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            transform: [{ translateY: tabBarAnim }],
          }}>
            {REQUESTER_TABS.map((tab) => {
              const isActive = (segments as string[]).includes(tab.name);
              return (
                <Pressable
                  key={tab.name}
                  onPress={() => {
                    console.log('[RequesterLayout] Tab pressed:', tab.label);
                    router.replace(tab.route);
                  }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}
                >
                  <MaterialIcons name={tab.icon} size={24} color={isActive ? '#1C1C1E' : '#8E8E93'} />
                  <Text style={{ fontSize: 10, fontWeight: isActive ? '600' : '400', color: isActive ? '#1C1C1E' : '#8E8E93', marginTop: 3 }}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>
        )}
      </View>
    </TabBarVisibilityContext.Provider>
  );
}

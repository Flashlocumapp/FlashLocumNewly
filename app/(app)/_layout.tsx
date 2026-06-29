import React from 'react';
import { View } from 'react-native';
import { Stack, Href } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';

const TABS: TabBarItem[] = [
  { name: '(home)', route: '/(app)/(home)' as Href, icon: 'home', label: 'Home' },
  { name: '(shifts)', route: '/(app)/(shifts)' as Href, icon: 'calendar-month', label: 'Shifts' },
  { name: '(profile)', route: '/(app)/(profile)' as Href, icon: 'person', label: 'Profile' },
];

export default function AppLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(home)" />
        <Stack.Screen name="(shifts)" />
        <Stack.Screen name="(profile)" />
      </Stack>
      <FloatingTabBar tabs={TABS} containerWidth={280} />
    </View>
  );
}

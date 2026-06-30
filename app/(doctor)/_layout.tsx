import React from 'react';
import { View } from 'react-native';
import { Stack, Href } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';

const TABS: TabBarItem[] = [
  { name: '(home)', route: '/(doctor)/(home)' as Href, icon: 'home', label: 'Home' },
  { name: '(coverage)', route: '/(doctor)/(coverage)' as Href, icon: 'calendar-month', label: 'Coverage' },
  { name: '(earnings)', route: '/(doctor)/(earnings)' as Href, icon: 'trending-up', label: 'Earnings' },
  { name: '(account)', route: '/(doctor)/(account)' as Href, icon: 'person', label: 'Account' },
];

export default function DoctorLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(home)" />
        <Stack.Screen name="(coverage)" />
        <Stack.Screen name="(earnings)" />
        <Stack.Screen name="(account)" />
      </Stack>
      <FloatingTabBar tabs={TABS} containerWidth={320} />
    </View>
  );
}

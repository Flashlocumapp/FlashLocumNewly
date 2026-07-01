import React from 'react';
import { View } from 'react-native';
import { Stack, Href } from 'expo-router';
import DoctorTabBar, { DoctorTabItem } from '@/components/DoctorTabBar';

const TABS: DoctorTabItem[] = [
  { name: '(home)', route: '/(doctor)/(home)' as Href, icon: 'home', label: 'Home' },
  { name: '(coverage)', route: '/(doctor)/(coverage)' as Href, icon: 'access-time', label: 'Coverage' },
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
      <DoctorTabBar tabs={TABS} />
    </View>
  );
}

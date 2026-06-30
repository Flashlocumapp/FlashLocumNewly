import React from 'react';
import { View } from 'react-native';
import { Stack, Href } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';

const TABS: TabBarItem[] = [
  { name: '(home)', route: '/(requester)/(home)' as Href, icon: 'home', label: 'Home' },
  { name: '(coverage)', route: '/(requester)/(coverage)' as Href, icon: 'calendar-month', label: 'Coverage' },
  { name: '(account)', route: '/(requester)/(account)' as Href, icon: 'person', label: 'Account' },
];

export default function RequesterLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(home)" />
        <Stack.Screen name="(coverage)" />
        <Stack.Screen name="(account)" />
      </Stack>
      <FloatingTabBar tabs={TABS} containerWidth={260} />
    </View>
  );
}

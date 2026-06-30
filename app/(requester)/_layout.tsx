import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Stack, useRouter, usePathname, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const TABS = [
  { name: '(home)',     route: '/(requester)/(home)'     as Href, icon: 'home'           as const, label: 'Home'     },
  { name: '(coverage)', route: '/(requester)/(coverage)' as Href, icon: 'calendar-month' as const, label: 'Coverage' },
  { name: '(account)',  route: '/(requester)/(account)'  as Href, icon: 'person'         as const, label: 'Account'  },
];

export default function RequesterLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const activeIndex = TABS.findIndex(t => pathname.includes(t.name));
  const active = activeIndex >= 0 ? activeIndex : 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(home)" />
        <Stack.Screen name="(coverage)" />
        <Stack.Screen name="(account)" />
      </Stack>

      {/* Full-width dark tab bar */}
      <View style={{
        backgroundColor: '#1C1C1E',
        flexDirection: 'row',
        paddingBottom: insets.bottom,
        borderTopWidth: 0.5,
        borderTopColor: 'rgba(255,255,255,0.08)',
      }}>
        {TABS.map((tab, i) => {
          const isActive = active === i;
          return (
            <TouchableOpacity
              key={tab.name}
              onPress={() => {
                console.log('[RequesterLayout] Tab pressed:', tab.label);
                router.push(tab.route);
              }}
              activeOpacity={0.7}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}
            >
              <MaterialIcons
                name={tab.icon}
                size={24}
                color={isActive ? '#FFFFFF' : '#636366'}
              />
              <Text style={{
                fontSize: 10,
                fontWeight: isActive ? '600' : '400',
                color: isActive ? '#FFFFFF' : '#636366',
                marginTop: 3,
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

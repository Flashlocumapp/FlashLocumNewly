import React, { useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { TabBarVisibilityContext, TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const REQUESTER_TABS = [
  { name: '(home)',     icon: 'home'           as const, label: 'Home'     },
  { name: '(coverage)', icon: 'calendar-month' as const, label: 'Coverage' },
  { name: '(account)',  icon: 'person'         as const, label: 'Account'  },
];

export default function RequesterLayoutIOS() {
  const insets = useSafeAreaInsets();
  const tabBarAnim = useRef(new Animated.Value(0)).current;
  const TAB_BAR_TOTAL = TAB_BAR_HEIGHT + insets.bottom;

  const setTabBarVisible = (visible: boolean) => {
    Animated.timing(tabBarAnim, { toValue: visible ? 0 : TAB_BAR_TOTAL, duration: 260, useNativeDriver: true }).start();
  };

  const renderTabBar = (props: BottomTabBarProps) => {
    const activeIndex = props.state.index;
    const activeColor = '#1C1C1E';
    const bgColor = '#F9F9F6';

    return (
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: bgColor,
          flexDirection: 'row',
          paddingBottom: insets.bottom,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          transform: [{ translateY: tabBarAnim }],
        }}
      >
        {REQUESTER_TABS.map((tab, i) => {
          const isActive = activeIndex === i;
          return (
            <Pressable
              key={tab.name}
              onPress={() => {
                if (isActive) return;
                console.log('[RequesterTabBar iOS] Tab pressed:', tab.name);
                props.navigation.navigate(tab.name);
              }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}
            >
              <MaterialIcons name={tab.icon} size={24} color={isActive ? activeColor : '#8E8E93'} />
              <Text style={{ fontSize: 10, fontWeight: isActive ? '600' : '400', color: isActive ? activeColor : '#8E8E93', marginTop: 3 }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>
    );
  };

  return (
    <TabBarVisibilityContext.Provider value={{ setTabBarVisible }}>
      <View style={{ flex: 1, backgroundColor: '#F9F9F6' }}>
        <Tabs
          tabBar={renderTabBar}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen name="(home)" />
          <Tabs.Screen name="(coverage)" />
          <Tabs.Screen name="(account)" />
        </Tabs>
      </View>
    </TabBarVisibilityContext.Provider>
  );
}

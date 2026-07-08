import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useSegments, Href } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export interface DoctorTabItem {
  name: string;
  route: Href;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
}

interface Props {
  tabs: DoctorTabItem[];
}

export default function DoctorTabBar({ tabs }: Props) {
  const router = useRouter();
  const segments = useSegments();

  const activeIndex = React.useMemo(() => {
    const idx = tabs.findIndex(t => segments.includes(t.name as never));
    return idx >= 0 ? idx : 0;
  }, [segments, tabs]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={[styles.bar, { backgroundColor: '#F9F9F6' }]}>
        {tabs.map((tab, i) => {
          const isActive = activeIndex === i;
          const iconColor = isActive ? '#1C1C1E' : '#8E8E93';
          return (
            <Pressable
              key={tab.name}
              style={styles.tab}
              onPress={() => {
                console.log('[DoctorTabBar] Tab pressed:', tab.label, 'route:', tab.route);
                router.replace(tab.route);
              }}
            >
              <MaterialIcons
                name={tab.icon}
                size={24}
                color={iconColor}
              />
              <Text style={[styles.label, isActive && { color: '#1C1C1E', fontWeight: '700' }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  bar: {
    flexDirection: 'row',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'android' ? 12 : 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: '#8E8E93',
  },

});

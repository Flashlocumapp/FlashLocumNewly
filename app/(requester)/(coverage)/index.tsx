import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { TAB_BAR_HEIGHT } from '../_layout';

const TABS = ['Active', 'Upcoming', 'History'] as const;
type TabType = typeof TABS[number];

export default function RequesterCoverageScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>('Active');

  const handleTabPress = (tab: TabType) => {
    console.log('[RequesterCoverage] Tab pressed:', tab);
    setActiveTab(tab);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F7F7F5' }}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: SPACING.base,
        paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[TYPOGRAPHY.h1, { color: COLORS.text, marginBottom: 4 }]}>
        Coverage
      </Text>
      <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginBottom: SPACING.xl }]}>
        Your coverage continuity
      </Text>

      {/* Tab selector */}
      <View
        style={{
          backgroundColor: '#EFEFEF',
          borderRadius: RADIUS.full,
          flexDirection: 'row',
          padding: 4,
          marginBottom: SPACING.xxl,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => handleTabPress(tab)}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: 'center',
                borderRadius: RADIUS.full,
                backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.10)' : undefined,
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  TYPOGRAPHY.captionMedium,
                  {
                    color: isActive ? COLORS.text : COLORS.textSecondary,
                    fontWeight: isActive ? '600' : '500',
                  },
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Empty state */}
      <View style={{ alignItems: 'center', marginTop: SPACING.xxxl }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: RADIUS.full,
            backgroundColor: '#EBEBEB',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: SPACING.base,
          }}
        >
          <Clock size={28} color={COLORS.textTertiary} />
        </View>
        <Text style={[TYPOGRAPHY.body, { color: COLORS.textSecondary }]}>
          No active coverage right now.
        </Text>
      </View>
    </ScrollView>
  );
}

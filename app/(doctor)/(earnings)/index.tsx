import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrendingUp } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';

export default function DoctorEarningsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F7F7F5' }}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: SPACING.base,
        paddingBottom: 120,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[TYPOGRAPHY.h1, { color: COLORS.text, marginBottom: 4 }]}>
        Earnings
      </Text>
      <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginBottom: SPACING.xl }]}>
        Your payout summary
      </Text>

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
          <TrendingUp size={28} color={COLORS.textTertiary} />
        </View>
        <Text style={[TYPOGRAPHY.body, { color: COLORS.textSecondary }]}>
          No earnings yet.
        </Text>
      </View>
    </ScrollView>
  );
}

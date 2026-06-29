import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { Stack } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';

const SEGMENTS = ['Upcoming', 'Past'] as const;
type Segment = typeof SEGMENTS[number];

export default function ShiftsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [activeSegment, setActiveSegment] = useState<Segment>('Upcoming');

  const bg = isDark ? COLORS.dark.background : COLORS.background;
  const surface = isDark ? COLORS.dark.surface : COLORS.surface;
  const surfaceSecondary = isDark ? COLORS.dark.surfaceSecondary : COLORS.surfaceSecondary;
  const textColor = isDark ? COLORS.dark.text : COLORS.text;
  const textSecondary = isDark ? COLORS.dark.textSecondary : COLORS.textSecondary;
  const borderColor = isDark ? COLORS.dark.border : COLORS.border;

  const handleSegmentPress = (segment: Segment) => {
    setActiveSegment(segment);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Shifts' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{
          paddingHorizontal: SPACING.base,
          paddingBottom: SPACING.xxxl + SPACING.xl,
          gap: SPACING.base,
        }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {/* Segmented control */}
        <View
          style={{
            backgroundColor: surfaceSecondary,
            borderRadius: RADIUS.lg,
            padding: SPACING.xs,
            flexDirection: 'row',
            gap: SPACING.xs,
          }}
        >
          {SEGMENTS.map((segment) => {
            const isActive = activeSegment === segment;
            return (
              <AnimatedPressable
                key={segment}
                onPress={() => handleSegmentPress(segment)}
                scaleValue={0.97}
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: RADIUS.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isActive ? surface : 'transparent',
                  boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.08)' : undefined,
                }}
              >
                <Text
                  style={[
                    TYPOGRAPHY.captionMedium,
                    {
                      color: isActive ? textColor : textSecondary,
                      fontWeight: isActive ? '600' : '500',
                    },
                  ]}
                >
                  {segment}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>

        {/* Empty state */}
        <View
          style={{
            backgroundColor: surface,
            borderRadius: RADIUS.xl,
            padding: SPACING.xxxl,
            alignItems: 'center',
            borderWidth: 1,
            borderColor,
            boxShadow: '0 2px 8px rgba(0, 102, 204, 0.06)',
            marginTop: SPACING.sm,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: RADIUS.lg,
              backgroundColor: COLORS.primaryMuted,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: SPACING.lg,
            }}
          >
            <Calendar size={30} color={COLORS.primary} />
          </View>
          <Text
            style={[
              TYPOGRAPHY.h3,
              { color: textColor, textAlign: 'center', marginBottom: SPACING.sm },
            ]}
          >
            No shifts yet
          </Text>
          <Text
            style={[
              TYPOGRAPHY.body,
              { color: textSecondary, textAlign: 'center', lineHeight: 22 },
            ]}
          >
            Your accepted shifts will appear here
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

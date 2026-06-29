import React from 'react';
import {
  View,
  Text,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Calendar, ChevronRight, Briefcase, User } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bg = isDark ? COLORS.dark.background : COLORS.background;
  const surface = isDark ? COLORS.dark.surface : COLORS.surface;
  const surfaceSecondary = isDark ? COLORS.dark.surfaceSecondary : COLORS.surfaceSecondary;
  const textColor = isDark ? COLORS.dark.text : COLORS.text;
  const textSecondary = isDark ? COLORS.dark.textSecondary : COLORS.textSecondary;
  const textTertiary = isDark ? COLORS.dark.textTertiary : COLORS.textTertiary;
  const borderColor = isDark ? COLORS.dark.border : COLORS.border;

  const userEmail = user?.email ?? '';
  const displayName = userEmail.split('@')[0] ?? 'there';

  const handleBrowseShifts = () => {
    console.log('[Home] Browse Shifts quick action pressed');
    router.push('/(app)/(shifts)');
  };

  const handleMyProfile = () => {
    console.log('[Home] My Profile quick action pressed');
    router.push('/(app)/(profile)');
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Home' }} />
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
        {/* Welcome card */}
        <View
          style={{
            backgroundColor: COLORS.primary,
            borderRadius: RADIUS.xl,
            padding: SPACING.xl,
            boxShadow: '0 4px 16px rgba(0, 102, 204, 0.25)',
          }}
        >
          <Text style={[TYPOGRAPHY.caption, { color: 'rgba(255,255,255,0.7)', marginBottom: SPACING.xs }]}>
            Welcome back
          </Text>
          <Text style={[TYPOGRAPHY.h3, { color: COLORS.textInverse, marginBottom: SPACING.sm }]}>
            {displayName}
          </Text>
          <Text style={[TYPOGRAPHY.caption, { color: 'rgba(255,255,255,0.65)' }]}>
            {userEmail}
          </Text>
          <View
            style={{
              marginTop: SPACING.lg,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: RADIUS.md,
              padding: SPACING.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACING.sm,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: RADIUS.full,
                backgroundColor: COLORS.success,
              }}
            />
            <Text style={[TYPOGRAPHY.captionMedium, { color: COLORS.textInverse }]}>
              Account active
            </Text>
          </View>
        </View>

        {/* Upcoming shifts section */}
        <View>
          <Text
            style={[
              TYPOGRAPHY.h4,
              { color: textColor, marginBottom: SPACING.sm, marginTop: SPACING.xs },
            ]}
          >
            Upcoming shifts
          </Text>
          <View
            style={{
              backgroundColor: surface,
              borderRadius: RADIUS.xl,
              padding: SPACING.xxl,
              alignItems: 'center',
              borderWidth: 1,
              borderColor,
              boxShadow: '0 2px 8px rgba(0, 102, 204, 0.06)',
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: RADIUS.lg,
                backgroundColor: COLORS.primaryMuted,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: SPACING.base,
              }}
            >
              <Calendar size={26} color={COLORS.primary} />
            </View>
            <Text
              style={[
                TYPOGRAPHY.h4,
                { color: textColor, textAlign: 'center', marginBottom: SPACING.sm },
              ]}
            >
              No upcoming shifts
            </Text>
            <Text
              style={[
                TYPOGRAPHY.caption,
                { color: textSecondary, textAlign: 'center', lineHeight: 20 },
              ]}
            >
              Browse the marketplace to find coverage opportunities
            </Text>
          </View>
        </View>

        {/* Quick actions */}
        <View>
          <Text
            style={[
              TYPOGRAPHY.h4,
              { color: textColor, marginBottom: SPACING.sm },
            ]}
          >
            Quick actions
          </Text>
          <View style={{ gap: SPACING.sm }}>
            <AnimatedPressable
              onPress={handleBrowseShifts}
              style={{
                backgroundColor: surface,
                borderRadius: RADIUS.lg,
                borderWidth: 1,
                borderColor,
                boxShadow: '0 2px 8px rgba(0, 102, 204, 0.06)',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: SPACING.base,
                  gap: SPACING.base,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: RADIUS.md,
                    backgroundColor: COLORS.primaryMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Briefcase size={22} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[TYPOGRAPHY.bodyMedium, { color: textColor }]}>
                    Browse Shifts
                  </Text>
                  <Text style={[TYPOGRAPHY.caption, { color: textSecondary }]}>
                    Find available coverage opportunities
                  </Text>
                </View>
                <ChevronRight size={18} color={textTertiary} />
              </View>
            </AnimatedPressable>

            <AnimatedPressable
              onPress={handleMyProfile}
              style={{
                backgroundColor: surface,
                borderRadius: RADIUS.lg,
                borderWidth: 1,
                borderColor,
                boxShadow: '0 2px 8px rgba(0, 102, 204, 0.06)',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: SPACING.base,
                  gap: SPACING.base,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: RADIUS.md,
                    backgroundColor: COLORS.accentMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User size={22} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[TYPOGRAPHY.bodyMedium, { color: textColor }]}>
                    My Profile
                  </Text>
                  <Text style={[TYPOGRAPHY.caption, { color: textSecondary }]}>
                    Manage your account and credentials
                  </Text>
                </View>
                <ChevronRight size={18} color={textTertiary} />
              </View>
            </AnimatedPressable>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

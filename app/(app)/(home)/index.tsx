import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ChevronRight, Building2, Stethoscope } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { usePathwayGuard } from '@/hooks/usePathwayGuard';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const { canAccessDoctor, canAccessRequester, enterDoctor, enterRequester } = usePathwayGuard();

  useEffect(() => {
    if (!profile) return;
    const doctorComplete = profile.doctor_onboarding_complete === true;
    const requesterComplete = profile.requester_onboarding_complete === true;

    // Only one pathway complete — redirect to that pathway's map
    if (doctorComplete && !requesterComplete) {
      console.log('[HomeScreen] Guard: doctor only complete, redirecting to doctor home');
      router.replace('/(doctor)/(home)' as any);
      return;
    }
    if (requesterComplete && !doctorComplete) {
      console.log('[HomeScreen] Guard: requester only complete, redirecting to requester home');
      router.replace('/(requester)/(home)' as any);
      return;
    }
    // Neither complete — redirect to onboarding
    if (!doctorComplete && !requesterComplete) {
      const route = profile.role === 'doctor'
        ? '/(onboarding)/doctor/basic-profile'
        : '/(onboarding)/requester/basic-profile';
      console.log('[HomeScreen] Guard: no pathway complete, redirecting to onboarding:', route);
      router.replace(route as any);
    }
  }, [profile]);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bg = isDark ? COLORS.dark.background : COLORS.background;
  const surface = isDark ? COLORS.dark.surface : COLORS.surface;
  const textColor = isDark ? COLORS.dark.text : COLORS.text;
  const textSecondary = isDark ? COLORS.dark.textSecondary : COLORS.textSecondary;
  const textTertiary = isDark ? COLORS.dark.textTertiary : COLORS.textTertiary;
  const borderColor = isDark ? COLORS.dark.border : COLORS.border;

  const userEmail = user?.email ?? '';
  const displayName = userEmail.split('@')[0] ?? 'there';

  const requesterBadgeText = canAccessRequester ? 'Active' : 'Set up';
  const doctorBadgeText = canAccessDoctor ? 'Active' : 'Set up';
  const requesterBadgeBg = canAccessRequester ? 'rgba(45, 198, 83, 0.12)' : 'rgba(138, 138, 138, 0.12)';
  const doctorBadgeBg = canAccessDoctor ? 'rgba(45, 198, 83, 0.12)' : 'rgba(138, 138, 138, 0.12)';
  const requesterBadgeColor = canAccessRequester ? '#1A9E45' : '#8A8A8A';
  const doctorBadgeColor = canAccessDoctor ? '#1A9E45' : '#8A8A8A';

  const handleEnterRequester = () => {
    console.log('[HomeScreen] Request Coverage card pressed');
    enterRequester();
  };

  const handleEnterDoctor = () => {
    console.log('[HomeScreen] Cover & Earn card pressed');
    enterDoctor();
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

        {/* Pathway cards */}
        <View>
          <Text
            style={[
              TYPOGRAPHY.h4,
              { color: textColor, marginBottom: SPACING.sm, marginTop: SPACING.xs },
            ]}
          >
            Your pathways
          </Text>
          <View style={{ gap: SPACING.sm }}>
            {/* Request Coverage */}
            <AnimatedPressable
              onPress={handleEnterRequester}
              style={{
                backgroundColor: surface,
                borderRadius: RADIUS.xl,
                borderWidth: 1,
                borderColor,
                overflow: 'hidden',
                boxShadow: '0 2px 10px rgba(0, 102, 204, 0.07)',
              }}
            >
              <View style={{ padding: SPACING.base }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.base }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: RADIUS.lg,
                      backgroundColor: 'rgba(0, 102, 204, 0.10)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Building2 size={24} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 4 }}>
                      <Text style={[TYPOGRAPHY.bodySemibold, { color: textColor }]}>
                        Request Coverage
                      </Text>
                      <View
                        style={{
                          backgroundColor: requesterBadgeBg,
                          borderRadius: RADIUS.full,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={[TYPOGRAPHY.label, { color: requesterBadgeColor }]}>
                          {requesterBadgeText}
                        </Text>
                      </View>
                    </View>
                    <Text style={[TYPOGRAPHY.caption, { color: textSecondary, lineHeight: 18 }]}>
                      Request temporary medical coverage for facilities, patients, or teams.
                    </Text>
                  </View>
                  <ChevronRight size={18} color={textTertiary} style={{ marginTop: 2 }} />
                </View>
              </View>
            </AnimatedPressable>

            {/* Cover & Earn */}
            <AnimatedPressable
              onPress={handleEnterDoctor}
              style={{
                backgroundColor: surface,
                borderRadius: RADIUS.xl,
                borderWidth: 1,
                borderColor,
                overflow: 'hidden',
                boxShadow: '0 2px 10px rgba(0, 168, 120, 0.07)',
              }}
            >
              <View style={{ padding: SPACING.base }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.base }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: RADIUS.lg,
                      backgroundColor: 'rgba(0, 168, 120, 0.10)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Stethoscope size={24} color={COLORS.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 4 }}>
                      <Text style={[TYPOGRAPHY.bodySemibold, { color: textColor }]}>
                        Cover &amp; Earn
                      </Text>
                      <View
                        style={{
                          backgroundColor: doctorBadgeBg,
                          borderRadius: RADIUS.full,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={[TYPOGRAPHY.label, { color: doctorBadgeColor }]}>
                          {doctorBadgeText}
                        </Text>
                      </View>
                    </View>
                    <Text style={[TYPOGRAPHY.caption, { color: textSecondary, lineHeight: 18 }]}>
                      Accept temporary medical coverage requests and earn.
                    </Text>
                  </View>
                  <ChevronRight size={18} color={textTertiary} style={{ marginTop: 2 }} />
                </View>
              </View>
            </AnimatedPressable>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

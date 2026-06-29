import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Polygon } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '@/components/AnimatedPressable';

const OFF_WHITE = '#F5F5F0';
const DARK = '#111315';
const MUTED = '#6B7280';
const BORDER = '#E5E5E0';
const BRAND_BLUE = '#0066CC';

export default function RoleSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleRequestCoverage = () => {
    router.push('/(auth)/sign-up?role=requester');
  };

  const handleCoverAndEarn = () => {
    router.push('/(auth)/sign-up?role=doctor');
  };

  const handleSignIn = () => {
    router.push('/(auth)/sign-in');
  };

  const handleTerms = () => {
    // Terms pressed
  };

  const handlePrivacy = () => {
    // Privacy pressed
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* Top content block */}
      <View>
        {/* Wordmark */}
        <View style={styles.wordmarkContainer}>
          <Svg width={16} height={20} viewBox="0 0 40 52" style={{ marginRight: 4 }}>
            <Polygon
              points="22,0 8,28 18,28 10,52 34,20 22,20 32,0"
              fill={DARK}
            />
          </Svg>
          <Text style={styles.wordmarkBold}>Flash</Text>
          <Text style={styles.wordmarkRegular}>Locum</Text>
        </View>

        {/* Heading */}
        <Text style={styles.heading}>How will you use FlashLocum?</Text>
        <Text style={styles.subtitle}>You can switch anytime from your profile.</Text>

        {/* Cards */}
        <View style={styles.cardsContainer}>
          {/* Request Coverage */}
          <AnimatedPressable onPress={handleRequestCoverage} style={styles.card}>
            <View style={styles.cardContent}>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Request Coverage</Text>
                <Text style={styles.cardSubtitle}>
                  Request temporary medical coverage for facilities, patients, or teams.
                </Text>
              </View>
              <View style={styles.arrowCircle}>
                <Text style={styles.arrowText}>→</Text>
              </View>
            </View>
          </AnimatedPressable>

          {/* Cover & Earn */}
          <AnimatedPressable onPress={handleCoverAndEarn} style={styles.card}>
            <View style={styles.cardContent}>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Cover & Earn</Text>
                <Text style={styles.cardSubtitle}>
                  Accept temporary medical coverage requests and earn.
                </Text>
              </View>
              <View style={styles.arrowCircle}>
                <Text style={styles.arrowText}>→</Text>
              </View>
            </View>
          </AnimatedPressable>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerBrand}>FLASHLOCUM · REALTIME COVERAGE NETWORK</Text>
        <View style={styles.footerLinks}>
          <AnimatedPressable onPress={handleTerms} scaleValue={0.95}>
            <Text style={styles.footerLink}>Terms</Text>
          </AnimatedPressable>
          <Text style={styles.footerDivider}>  </Text>
          <AnimatedPressable onPress={handlePrivacy} scaleValue={0.95}>
            <Text style={styles.footerLink}>Privacy</Text>
          </AnimatedPressable>
        </View>
        <View style={styles.signInRow}>
          <Text style={styles.signInText}>Already have an account? </Text>
          <AnimatedPressable onPress={handleSignIn} scaleValue={0.95}>
            <Text style={styles.signInLink}>Sign in</Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: OFF_WHITE,
    paddingHorizontal: 24,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  wordmarkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  wordmarkBold: {
    fontSize: 18,
    fontWeight: '700',
    color: DARK,
    letterSpacing: -0.3,
  },
  wordmarkRegular: {
    fontSize: 18,
    fontWeight: '400',
    color: DARK,
    letterSpacing: -0.3,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: DARK,
    letterSpacing: -0.5,
    marginBottom: 8,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 20,
    lineHeight: 20,
  },
  cardsContainer: {
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  cardText: {
    flex: 1,
    marginRight: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: DARK,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
  },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  arrowText: {
    fontSize: 16,
    color: DARK,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 16,
  },
  footerBrand: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND_BLUE,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 10,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  footerLink: {
    fontSize: 12,
    color: MUTED,
    textDecorationLine: 'underline',
  },
  footerDivider: {
    fontSize: 12,
    color: MUTED,
  },
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signInText: {
    fontSize: 13,
    color: MUTED,
  },
  signInLink: {
    fontSize: 13,
    fontWeight: '700',
    color: DARK,
    textDecorationLine: 'underline',
  },
});

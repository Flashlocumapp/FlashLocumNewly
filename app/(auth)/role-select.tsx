import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '@/components/AnimatedPressable';

export default function RoleSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleRequestCoverage = () => {
    router.push('/(auth)/sign-up?role=requester');
  };

  const handleCoverAndEarn = () => {
    router.push('/(auth)/sign-up?role=doctor');
  };

  const handleTerms = () => {
    router.push('/(auth)/terms');
  };

  const handlePrivacy = () => {
    router.push('/(auth)/privacy');
  };

  const topPadding = insets.top + 72;

  return (
    <View style={styles.container}>
      {/* Top area */}
      <View style={[styles.topArea, { paddingTop: topPadding }]}>
        <Text style={styles.heading}>{'How will you use\nFlashLocum?'}</Text>
        <Text style={styles.subtitle}>You can switch anytime from your profile.</Text>
      </View>

      {/* Cards */}
      <View style={styles.cardsContainer}>
        {/* Request Coverage */}
        <AnimatedPressable onPress={handleRequestCoverage} scaleValue={0.97} style={styles.card}>
          <View style={styles.cardInner}>
            <View style={styles.cardLeft}>
              <Text style={styles.cardTitle}>Request Coverage</Text>
              <Text style={styles.cardDesc}>
                Request temporary medical coverage for facilities, patients, or teams.
              </Text>
            </View>
            <View style={styles.arrowButton}>
              <Text style={styles.arrowText}>→</Text>
            </View>
          </View>
        </AnimatedPressable>

        {/* Cover & Earn */}
        <AnimatedPressable onPress={handleCoverAndEarn} scaleValue={0.97} style={styles.card}>
          <View style={styles.cardInner}>
            <View style={styles.cardLeft}>
              <Text style={styles.cardTitle}>Cover & Earn</Text>
              <Text style={styles.cardDesc}>
                Accept temporary medical coverage requests and earn.
              </Text>
            </View>
            <View style={styles.arrowButton}>
              <Text style={styles.arrowText}>→</Text>
            </View>
          </View>
        </AnimatedPressable>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.footerBrand}>FLASHLOCUM · REALTIME COVERAGE NETWORK</Text>
        <View style={styles.footerLinks}>
          <AnimatedPressable onPress={handleTerms} scaleValue={0.95}>
            <Text style={styles.footerLink}>Terms</Text>
          </AnimatedPressable>
          <AnimatedPressable onPress={handlePrivacy} scaleValue={0.95}>
            <Text style={styles.footerLink}>Privacy</Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  topArea: {
    paddingHorizontal: 28,
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.8,
    lineHeight: 38,
    marginTop: 40,
  },
  subtitle: {
    fontSize: 15,
    color: '#8A8A8A',
    fontWeight: '400',
    marginTop: 8,
  },
  cardsContainer: {
    marginTop: 32,
    paddingHorizontal: 28,
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
    paddingRight: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  cardDesc: {
    fontSize: 14,
    color: '#8A8A8A',
    marginTop: 4,
    lineHeight: 20,
  },
  arrowButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 18,
    color: '#0A0A0A',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  footerBrand: {
    fontSize: 10,
    fontWeight: '600',
    color: '#BBBBBB',
    letterSpacing: 1.2,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: 24,
  },
  footerLink: {
    fontSize: 13,
    color: '#8A8A8A',
    textDecorationLine: 'underline',
  },
});

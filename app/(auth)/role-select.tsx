import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ImageSourcePropType,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '@/components/AnimatedPressable';

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

const wordmark = require('@/assets/images/d5820e75-3b63-4adb-b820-37ad1d151041.png');

export default function RoleSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleRequestCoverage = () => {
    console.log('[RoleSelect] Request Coverage card pressed');
    router.push('/(auth)/sign-up?role=requester');
  };

  const handleCoverAndEarn = () => {
    console.log('[RoleSelect] Cover & Earn card pressed');
    router.push('/(auth)/sign-up?role=doctor');
  };

  const handleSignIn = () => {
    console.log('[RoleSelect] Sign in link pressed');
    router.push('/(auth)/sign-up?mode=signin');
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      {/* Wordmark */}
      <Image
        source={resolveImageSource(wordmark)}
        style={styles.wordmark}
        resizeMode="contain"
      />

      {/* Heading */}
      <Text style={styles.heading}>How will you use FlashLocum?</Text>
      <Text style={styles.subtitle}>You can switch anytime from your profile.</Text>

      {/* Cards */}
      <View style={styles.cardsContainer}>
        {/* Request Coverage */}
        <AnimatedPressable onPress={handleRequestCoverage} scaleValue={0.97} style={styles.cardLight}>
          <Text style={styles.cardTitleDark}>Request Coverage</Text>
          <Text style={styles.cardDescDark}>
            Request temporary medical coverage for facilities, patients, or teams.
          </Text>
        </AnimatedPressable>

        {/* Cover & Earn */}
        <AnimatedPressable onPress={handleCoverAndEarn} scaleValue={0.97} style={styles.cardDark}>
          <Text style={styles.cardTitleLight}>Cover & Earn</Text>
          <Text style={styles.cardDescLight}>
            Accept temporary medical coverage requests and earn.
          </Text>
        </AnimatedPressable>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {'Already have an account? '}
        </Text>
        <AnimatedPressable onPress={handleSignIn} scaleValue={0.95}>
          <Text style={styles.footerLink}>Sign in</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  wordmark: {
    width: 180,
    height: 48,
    alignSelf: 'center',
    marginTop: 48,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111315',
    marginTop: 48,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  cardsContainer: {
    marginTop: 40,
    paddingHorizontal: 24,
    gap: 16,
  },
  cardLight: {
    borderWidth: 1.5,
    borderColor: '#111315',
    borderRadius: 16,
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  cardDark: {
    backgroundColor: '#111315',
    borderRadius: 16,
    padding: 24,
  },
  cardTitleDark: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111315',
  },
  cardDescDark: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 6,
  },
  cardTitleLight: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardDescLight: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 14,
    color: '#6B7280',
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111315',
  },
});

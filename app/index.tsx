import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Polygon } from 'react-native-svg';
import { supabase } from '@/lib/supabase';

const DEEP_CHARCOAL = '#111315';
const SCREEN_WIDTH = Dimensions.get('window').width;
const CIRCLE_DIAMETER = 20;
const ANIMATION_DURATION = 6000;

const PHRASES = ["Let's request", "Let's accept", "Let's cover"];
const PHRASE_DURATION = 2000;
const CHAR_INTERVAL = 1400 / 12; // ~116ms per char for ~12 chars

export default function SplashAnimationScreen() {
  const router = useRouter();

  // Background auth check stored in ref — no re-renders
  const sessionRef = useRef<boolean | null>(null);

  // Rolling circle animation
  const circleTranslateX = useRef(new Animated.Value(-CIRCLE_DIAMETER)).current;
  const circleRotation = useRef(new Animated.Value(0)).current;

  // Typewriter state
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const phraseOpacity = useRef(new Animated.Value(1)).current;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dismiss native splash immediately
  useEffect(() => {
    SplashScreen.hideAsync();
    console.log('[SplashAnimation] Native splash dismissed');
  }, []);

  // Background auth check
  useEffect(() => {
    console.log('[SplashAnimation] Checking session in background');
    supabase.auth.getSession().then(({ data }) => {
      sessionRef.current = !!data.session;
      console.log('[SplashAnimation] Session check complete, hasSession:', sessionRef.current);
    });
  }, []);

  // Rolling circle animation
  useEffect(() => {
    const targetX = SCREEN_WIDTH + CIRCLE_DIAMETER;

    Animated.parallel([
      Animated.timing(circleTranslateX, {
        toValue: targetX,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(circleRotation, {
        toValue: 3, // 3 full rotations = 1080deg
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Typewriter effect
  useEffect(() => {
    let phraseIdx = 0;

    const runPhrase = (idx: number) => {
      if (idx >= PHRASES.length) return;

      const phrase = PHRASES[idx];
      let charIdx = 0;

      // Reset opacity and text
      phraseOpacity.setValue(1);
      setDisplayedText('');
      setCurrentPhraseIndex(idx);

      // Type characters
      intervalRef.current = setInterval(() => {
        charIdx += 1;
        const partial = phrase.slice(0, charIdx);
        setDisplayedText(partial);
        console.log('[SplashAnimation] Typing phrase', idx, ':', partial);

        if (charIdx >= phrase.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);

          // Hold for 0.3s then fade out
          timeoutRef.current = setTimeout(() => {
            Animated.timing(phraseOpacity, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }).start(() => {
              phraseIdx += 1;
              if (phraseIdx < PHRASES.length) {
                runPhrase(phraseIdx);
              }
            });
          }, 300);
        }
      }, CHAR_INTERVAL);
    };

    runPhrase(0);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Navigate after 6 seconds
  useEffect(() => {
    const navTimeout = setTimeout(() => {
      const hasSession = sessionRef.current;
      console.log('[SplashAnimation] Animation complete, navigating. hasSession:', hasSession);
      if (hasSession) {
        router.replace('/(app)/(home)');
      } else {
        router.replace('/(auth)/role-select');
      }
    }, ANIMATION_DURATION);

    return () => clearTimeout(navTimeout);
  }, []);

  const rotationInterpolate = circleRotation.interpolate({
    inputRange: [0, 3],
    outputRange: ['0deg', '1080deg'],
  });

  return (
    <View style={styles.container}>
      {/* Logo / Wordmark */}
      <View style={styles.logoContainer}>
        <Svg width={40} height={52} viewBox="0 0 40 52">
          <Polygon
            points="22,0 8,28 18,28 10,52 34,20 22,20 32,0"
            fill="white"
          />
        </Svg>
        <View style={styles.wordmarkRow}>
          <Text style={styles.wordmarkBold}>Flash</Text>
          <Text style={styles.wordmarkRegular}>Locum</Text>
        </View>
      </View>

      {/* Rolling circle track */}
      <View style={styles.trackContainer}>
        <View style={styles.track} />
        <Animated.View
          style={[
            styles.circle,
            {
              transform: [
                { translateX: circleTranslateX },
                { rotate: rotationInterpolate },
              ],
            },
          ]}
        />
      </View>

      {/* Typewriter text */}
      <View style={styles.phraseContainer}>
        <Animated.Text style={[styles.phraseText, { opacity: phraseOpacity }]}>
          {displayedText}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DEEP_CHARCOAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    position: 'absolute',
    top: '25%',
  },
  wordmarkRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  wordmarkBold: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  wordmarkRegular: {
    fontSize: 32,
    fontWeight: '400',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  trackContainer: {
    position: 'absolute',
    top: '55%',
    left: 0,
    right: 0,
    height: CIRCLE_DIAMETER,
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  circle: {
    position: 'absolute',
    width: CIRCLE_DIAMETER,
    height: CIRCLE_DIAMETER,
    borderRadius: CIRCLE_DIAMETER / 2,
    backgroundColor: '#FFFFFF',
    top: 0,
  },
  phraseContainer: {
    position: 'absolute',
    bottom: '20%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  phraseText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
});

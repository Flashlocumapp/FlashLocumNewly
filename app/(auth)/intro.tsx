import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSplash } from '@/app/_layout';

const PHRASES = ["Let's request", "Let's accept", "Let's cover"];

const CHAR_DELAY = 55;
const HOLD_FULL = 2000;
const FADE_OUT_DURATION = 250;
const BG_TRANSITION_DURATION = 400;

export default function IntroScreen() {
  const router = useRouter();
  const { dest } = useLocalSearchParams<{ dest?: string }>();
  const { signalScreenReady, splashDismissed } = useSplash();
  const splashSignalledRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!splashSignalledRef.current) {
        splashSignalledRef.current = true;
        signalScreenReady();
        console.log('[IntroScreen] signalScreenReady called');
      }
    }, [signalScreenReady])
  );

  const unmountedRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Initial state: show "FlashLocum" fully so the first frame after splash dismissal
  // matches the native splash image exactly — seamless handoff.
  const [displayedText, setDisplayedText] = useState('FlashLocum');
  // Track whether we are in the typewriter phase (ball should be visible)
  const [typewriterActive, setTypewriterActive] = useState(false);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const bgColor = useRef(new Animated.Value(0)).current;

  const addTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      if (!unmountedRef.current) fn();
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  };

  useEffect(() => {
    if (!splashDismissed) return; // hold until native splash has fully dismissed

    console.log('[IntroScreen] splashDismissed=true, starting intro animation');
    unmountedRef.current = false;

    const ALLOWED_DESTINATIONS = [
      '/(auth)/role-select',
      '/(doctor)/(home)',
      '/(requester)/(home)',
      '/(onboarding)/doctor/basic-profile',
      '/(onboarding)/requester/basic-profile',
    ];
    const decoded = dest ? decodeURIComponent(dest) : '/(auth)/role-select';
    const destination = ALLOWED_DESTINATIONS.includes(decoded) ? decoded : '/(auth)/role-select';

    const runPhrase = (index: number) => {
      if (unmountedRef.current) return;
      if (index >= PHRASES.length) return;

      const phrase = PHRASES[index];
      const isLast = index === PHRASES.length - 1;

      setDisplayedText('');
      contentOpacity.setValue(0);
      setTypewriterActive(true);

      // Pre-load the first character so text is ready before fade-in
      setDisplayedText(phrase.slice(0, 1));

      addTimeout(() => {
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start(() => {
          if (unmountedRef.current) return;

          let charIndex = 1;
          const typeNext = () => {
            if (unmountedRef.current) return;
            charIndex += 1;
            setDisplayedText(phrase.slice(0, charIndex));

            if (charIndex < phrase.length) {
              addTimeout(typeNext, CHAR_DELAY);
            } else {
              addTimeout(() => {
                Animated.timing(contentOpacity, {
                  toValue: 0,
                  duration: FADE_OUT_DURATION,
                  useNativeDriver: true,
                }).start(() => {
                  if (unmountedRef.current) return;
                  if (isLast) {
                    Animated.timing(bgColor, {
                      toValue: 1,
                      duration: BG_TRANSITION_DURATION,
                      useNativeDriver: false,
                    }).start(() => {
                      if (!unmountedRef.current) {
                        console.log('[IntroScreen] Animation complete, navigating to', destination);
                        router.replace(destination as any);
                      }
                    });
                  } else {
                    runPhrase(index + 1);
                  }
                });
              }, HOLD_FULL);
            }
          };

          addTimeout(typeNext, CHAR_DELAY);
        });
      }, 16);
    };

    // Fade out the static "FlashLocum" first, then begin the typewriter
    Animated.timing(contentOpacity, {
      toValue: 0,
      duration: FADE_OUT_DURATION,
      useNativeDriver: true,
    }).start(() => {
      if (!unmountedRef.current) {
        console.log('[IntroScreen] FlashLocum fade-out complete, starting typewriter');
        runPhrase(0);
      }
    });

    return () => {
      unmountedRef.current = true;
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [splashDismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  const backgroundColor = bgColor.interpolate({
    inputRange: [0, 1],
    outputRange: ['#111315', '#FFFFFF'],
  });

  return (
    <Animated.View style={[styles.container, { backgroundColor }]}>
      <Animated.View style={[styles.textRow, { opacity: contentOpacity }]}>
        <Text style={styles.text}>{displayedText}</Text>
        {typewriterActive && <View style={styles.ball} />}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  text: {
    fontSize: 32,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  ball: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignSelf: 'center',
    marginLeft: 4,
  },
});

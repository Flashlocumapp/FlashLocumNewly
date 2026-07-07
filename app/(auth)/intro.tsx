import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

const PHRASES = ["Let's request", "Let's accept", "Let's cover"];

const CHAR_DELAY = 55;
const HOLD_FULL = 2000;
const FADE_OUT_DURATION = 250;
const BG_TRANSITION_DURATION = 400;

export default function IntroScreen() {
  const router = useRouter();
  const { dest } = useLocalSearchParams<{ dest?: string }>();

  const unmountedRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const displayedTextRef = useRef('');
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  const contentOpacity = useRef(new Animated.Value(0)).current;
  const bgColor = useRef(new Animated.Value(0)).current;

  const addTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      if (!unmountedRef.current) fn();
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  };

  useEffect(() => {
    unmountedRef.current = false;

    const runPhrase = (index: number) => {
      if (unmountedRef.current) return;
      if (index >= PHRASES.length) return;

      const phrase = PHRASES[index];
      const isLast = index === PHRASES.length - 1;

      console.log(`[IntroScreen] Starting phrase ${index + 1}/${PHRASES.length}: "${phrase}"`);

      // Step 1: Reset text, opacity is already 0 from previous fade-out (or initial state).
      displayedTextRef.current = '';

      // Step 2: Pre-load the first character so text is ready but invisible.
      displayedTextRef.current = phrase.slice(0, 1);
      forceUpdate();

      // Step 3: Fade in to opacity 1 — text is already loaded so no blank frame.
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        if (unmountedRef.current) return;

        // Step 4: Type remaining characters (index 1 onwards).
        let charIndex = 1;
        const typeNext = () => {
          if (unmountedRef.current) return;
          charIndex += 1;
          displayedTextRef.current = phrase.slice(0, charIndex);
          forceUpdate();

          if (charIndex < phrase.length) {
            addTimeout(typeNext, CHAR_DELAY);
          } else {
            // Step 5: Hold then fade out.
            console.log(`[IntroScreen] Phrase complete: "${phrase}", holding for ${HOLD_FULL}ms`);
            addTimeout(() => {
              Animated.timing(contentOpacity, {
                toValue: 0,
                duration: FADE_OUT_DURATION,
                useNativeDriver: true,
              }).start(() => {
                if (unmountedRef.current) return;
                // Step 6: Navigate or advance to next phrase.
                if (isLast) {
                  const destination = dest ? decodeURIComponent(dest) : '/(auth)/role-select';
                  console.log('[IntroScreen] All phrases done, transitioning to:', destination);
                  Animated.timing(bgColor, {
                    toValue: 1,
                    duration: BG_TRANSITION_DURATION,
                    useNativeDriver: false,
                  }).start(() => {
                    if (!unmountedRef.current) {
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
    };

    runPhrase(0);

    return () => {
      unmountedRef.current = true;
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const backgroundColor = bgColor.interpolate({
    inputRange: [0, 1],
    outputRange: ['#0D0D0D', '#FFFFFF'],
  });

  const displayText = displayedTextRef.current;

  return (
    <Animated.View style={[styles.container, { backgroundColor }]}>
      <Animated.View style={[styles.textRow, { opacity: contentOpacity }]}>
        <Text style={styles.text}>{displayText}</Text>
        <View style={styles.ball} />
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

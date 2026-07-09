import React, { useEffect, useRef, useState } from 'react';
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

  // Use state instead of setNativeProps — reliable on all platforms and architectures
  const [displayedText, setDisplayedText] = useState('');

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

    const destination = dest ? decodeURIComponent(dest) : '/(auth)/role-select';

    const runPhrase = (index: number) => {
      if (unmountedRef.current) return;
      if (index >= PHRASES.length) return;

      const phrase = PHRASES[index];
      const isLast = index === PHRASES.length - 1;

      // Step 1: Reset text and ensure opacity is 0 before starting
      setDisplayedText('');
      contentOpacity.setValue(0);

      // Step 2: Pre-load the first character so text is ready before fade-in
      setDisplayedText(phrase.slice(0, 1));

      // Small delay to let React commit the first character before fading in
      addTimeout(() => {
        // Step 3: Fade in
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start(() => {
          if (unmountedRef.current) return;

          // Step 4: Type remaining characters
          let charIndex = 1;
          const typeNext = () => {
            if (unmountedRef.current) return;
            charIndex += 1;
            setDisplayedText(phrase.slice(0, charIndex));

            if (charIndex < phrase.length) {
              addTimeout(typeNext, CHAR_DELAY);
            } else {
              // Step 5: Hold then fade out
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
      }, 16); // one frame delay so React commits the first character
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

  return (
    <Animated.View style={[styles.container, { backgroundColor }]}>
      <Animated.View style={[styles.textRow, { opacity: contentOpacity }]}>
        <Text style={styles.text}>{displayedText}</Text>
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

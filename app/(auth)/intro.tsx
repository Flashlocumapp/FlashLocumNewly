import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

type Phase =
  | { kind: 'lets' }
  | { kind: 'full'; word: string };

const PHASES: Phase[] = [
  { kind: 'lets' },
  { kind: 'full', word: 'request' },
  { kind: 'lets' },
  { kind: 'full', word: 'respond' },
  { kind: 'lets' },
  { kind: 'full', word: 'cover' },
];

const CHAR_DELAY = 60;
const HOLD_LETS = 600;
const HOLD_FULL = 1400;
const FADE_OUT_DURATION = 300;
const BG_TRANSITION_DURATION = 400;

export default function IntroScreen() {
  const router = useRouter();

  const unmountedRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const displayedTextRef = useRef('');
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  const textOpacity = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(0)).current;
  const bgColor = useRef(new Animated.Value(0)).current;

  const showDot = useRef(false);
  const dotLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const addTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      if (!unmountedRef.current) fn();
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  };

  useEffect(() => {
    unmountedRef.current = false;

    const runPhase = (index: number) => {
      if (unmountedRef.current) return;
      if (index >= PHASES.length) return;

      const phase = PHASES[index];
      const isLast = index === PHASES.length - 1;

      // Build the full string to type
      const fullText = phase.kind === 'lets' ? "Let's..." : `Let's ${phase.word}`;
      const holdDuration = phase.kind === 'lets' ? HOLD_LETS : HOLD_FULL;

      // Reset
      displayedTextRef.current = '';
      showDot.current = false;
      dotOpacity.setValue(0);
      textOpacity.setValue(0);
      if (dotLoopRef.current) {
        dotLoopRef.current.stop();
        dotLoopRef.current = null;
      }

      // Fade in first character immediately
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }).start();

      // Type characters
      let charIndex = 0;
      const typeNext = () => {
        if (unmountedRef.current) return;
        charIndex += 1;
        displayedTextRef.current = fullText.slice(0, charIndex);
        forceUpdate();

        if (charIndex < fullText.length) {
          addTimeout(typeNext, CHAR_DELAY);
        } else {
          // Finished typing — show dot for full phrases
          if (phase.kind === 'full') {
            showDot.current = true;
            forceUpdate();
            dotOpacity.setValue(1);
            const loop = Animated.loop(
              Animated.sequence([
                Animated.timing(dotOpacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
                Animated.timing(dotOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
              ])
            );
            dotLoopRef.current = loop;
            loop.start();
          }

          // Hold then fade out
          addTimeout(() => {
            if (dotLoopRef.current) {
              dotLoopRef.current.stop();
              dotLoopRef.current = null;
            }
            Animated.parallel([
              Animated.timing(textOpacity, {
                toValue: 0,
                duration: FADE_OUT_DURATION,
                useNativeDriver: true,
              }),
              Animated.timing(dotOpacity, {
                toValue: 0,
                duration: FADE_OUT_DURATION,
                useNativeDriver: true,
              }),
            ]).start(() => {
              if (unmountedRef.current) return;
              if (isLast) {
                // Transition background to white then navigate
                Animated.timing(bgColor, {
                  toValue: 1,
                  duration: BG_TRANSITION_DURATION,
                  useNativeDriver: false,
                }).start(() => {
                  if (!unmountedRef.current) {
                    router.replace('/(auth)/role-select');
                  }
                });
              } else {
                runPhase(index + 1);
              }
            });
          }, holdDuration);
        }
      };

      addTimeout(typeNext, CHAR_DELAY);
    };

    runPhase(0);

    return () => {
      unmountedRef.current = true;
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      if (dotLoopRef.current) {
        dotLoopRef.current.stop();
      }
    };
  }, []);

  const backgroundColor = bgColor.interpolate({
    inputRange: [0, 1],
    outputRange: ['#0D0D0D', '#FFFFFF'],
  });

  const displayText = displayedTextRef.current;
  const hasDot = showDot.current;

  return (
    <Animated.View style={[styles.container, { backgroundColor }]}>
      <View style={styles.textRow}>
        <Animated.Text style={[styles.text, { opacity: textOpacity }]}>
          {displayText}
        </Animated.Text>
        {hasDot ? (
          <Animated.Text style={[styles.dot, { opacity: dotOpacity }]}>
            {' •'}
          </Animated.Text>
        ) : null}
      </View>
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
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: 1,
    textAlign: 'center',
  },
  dot: {
    fontSize: 32,
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});

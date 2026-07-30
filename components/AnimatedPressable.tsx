import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  withSpring,
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';

interface AnimatedPressableProps extends PressableProps {
  scaleValue?: number;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedPressable({
  onPress,
  style,
  children,
  disabled,
  scaleValue = 0.97,
  ...props
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.5 : opacity.value,
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPressIn={() => {
          // Opacity drops instantly (16ms) — user sees feedback on the very first frame
          opacity.value = withTiming(0.75, { duration: 16 });
          // Scale snaps fast — stiffness 500, damping 18 settles in ~120ms vs the old ~300ms
          scale.value = withSpring(scaleValue, { damping: 18, stiffness: 500 });
        }}
        onPressOut={() => {
          opacity.value = withTiming(1, { duration: 120 });
          scale.value = withSpring(1, { damping: 18, stiffness: 500 });
        }}
        onPress={onPress}
        disabled={disabled}
        {...props}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

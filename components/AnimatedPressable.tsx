import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import Animated, { useSharedValue, withSpring, useAnimatedStyle } from 'react-native-reanimated';

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

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.5 : 1,
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPressIn={() => {
          console.log('[AnimatedPressable] onPressIn');
          scale.value = withSpring(scaleValue, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 300 });
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

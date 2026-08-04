import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface InAppNotification {
  title: string;
  message: string;
}

interface Props {
  notification: InAppNotification | null;
  onDismiss: () => void;
}

export default function InAppNotificationBanner({ notification, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (notification) {
      // Clear any pending dismiss
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }

      // Slide in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 200,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss after 5 seconds
      dismissTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -120,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onDismiss();
        });
      }, 5000);
    } else {
      // Reset position immediately when notification is cleared externally
      translateY.setValue(-120);
      opacity.setValue(0);
    }

    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [notification]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!notification) return null;

  const topOffset = insets.top + 8;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: topOffset, transform: [{ translateY }], opacity },
      ]}
      pointerEvents="none"
    >
      <View style={styles.card}>
        <View style={styles.indicator} />
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {notification.message}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  card: {
    backgroundColor: '#1C1F22',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  indicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
    backgroundColor: '#4A90E2',
    marginRight: 12,
    flexShrink: 0,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 3,
  },
  message: {
    color: '#9BA3AF',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
});

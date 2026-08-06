import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Linking,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import Feather from '@expo/vector-icons/Feather';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { IS_EXPO_GO } from '@/utils/expoGoGuard';

interface PermissionsOverlayProps {
  visible: boolean;
  role: 'doctor' | 'requester';
  onAllGranted: () => void;
  onDismiss: () => void;
}

interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
  loading: boolean;
}

async function checkLocationPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
  return { granted: status === 'granted', canAskAgain };
}

async function checkNotifPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  if (IS_EXPO_GO) {
    return { granted: false, canAskAgain: false };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OneSignal = require('react-native-onesignal').OneSignal;
    const granted = await OneSignal.Notifications.hasPermission();
    // On iOS, once denied canAskAgain = false; we infer from granted
    // We can't get canAskAgain from OneSignal directly, so we track it via state
    return { granted, canAskAgain: !granted };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

export default function PermissionsOverlay({
  visible,
  role,
  onAllGranted,
  onDismiss,
}: PermissionsOverlayProps) {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const [locationPerm, setLocationPerm] = useState<PermissionState>({
    granted: false,
    canAskAgain: true,
    loading: false,
  });
  const [notifPerm, setNotifPerm] = useState<PermissionState>({
    granted: false,
    canAskAgain: true,
    loading: false,
  });
  // Track whether we've already tried requesting notif (to detect permanent denial)
  const [notifRequested, setNotifRequested] = useState(false);

  const refreshPermissions = useCallback(async () => {
    console.log('[PermissionsOverlay] Refreshing permission states');
    const [loc, notif] = await Promise.all([
      checkLocationPermission(),
      checkNotifPermission(),
    ]);
    setLocationPerm((prev) => ({ ...prev, granted: loc.granted, canAskAgain: loc.canAskAgain }));
    setNotifPerm((prev) => ({ ...prev, granted: notif.granted }));
  }, []);

  useEffect(() => {
    if (visible) {
      console.log('[PermissionsOverlay] Opened — reading OS permission states');
      setNotifRequested(false);
      refreshPermissions();
    }
  }, [visible, refreshPermissions]);

  const handleLocationPress = useCallback(async () => {
    console.log('[PermissionsOverlay] Location button pressed — canAskAgain:', locationPerm.canAskAgain);
    if (!locationPerm.canAskAgain) {
      console.log('[PermissionsOverlay] Location permanently denied — opening Settings');
      Linking.openSettings();
      return;
    }
    setLocationPerm((prev) => ({ ...prev, loading: true }));
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      console.log('[PermissionsOverlay] Location request result — status:', status, 'canAskAgain:', canAskAgain);
      setLocationPerm({ granted: status === 'granted', canAskAgain, loading: false });
    } catch (e) {
      console.log('[PermissionsOverlay] Location request error:', e);
      setLocationPerm((prev) => ({ ...prev, loading: false }));
    }
  }, [locationPerm.canAskAgain]);

  const handleNotifPress = useCallback(async () => {
    console.log('[PermissionsOverlay] Notifications button pressed — notifRequested:', notifRequested);
    if (notifRequested && !notifPerm.canAskAgain) {
      console.log('[PermissionsOverlay] Notifications permanently denied — opening Settings');
      Linking.openSettings();
      return;
    }
    if (IS_EXPO_GO) {
      console.log('[PermissionsOverlay] Expo Go — opening Settings for notifications');
      Linking.openSettings();
      return;
    }
    setNotifPerm((prev) => ({ ...prev, loading: true }));
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const OneSignal = require('react-native-onesignal').OneSignal;
      console.log('[PermissionsOverlay] Requesting notification permission via OneSignal');
      await OneSignal.Notifications.requestPermission(true);
      const granted = await OneSignal.Notifications.hasPermission();
      console.log('[PermissionsOverlay] Notification permission after request — granted:', granted);
      setNotifRequested(true);
      setNotifPerm({ granted, canAskAgain: !granted, loading: false });
    } catch (e) {
      console.log('[PermissionsOverlay] Notification request error:', e);
      setNotifRequested(true);
      setNotifPerm((prev) => ({ ...prev, loading: false }));
    }
  }, [notifRequested, notifPerm.canAskAgain]);

  const handleContinue = useCallback(() => {
    console.log('[PermissionsOverlay] Continue pressed — both permissions granted');
    onAllGranted();
  }, [onAllGranted]);

  const handleDismiss = useCallback(() => {
    console.log('[PermissionsOverlay] Dismissed without granting all permissions');
    onDismiss();
  }, [onDismiss]);

  const bothGranted = locationPerm.granted && notifPerm.granted;

  const locationSubtitle =
    role === 'doctor'
      ? 'Required to show your position to nearby requesters.'
      : 'Required for nearby doctor matching and request location.';

  const notifSubtitle =
    role === 'doctor'
      ? "So you don't miss new coverage requests."
      : 'Know when a doctor accepts and when shifts update.';

  // Determine button label for each permission
  const locationButtonLabel = locationPerm.canAskAgain ? 'Turn On' : 'Open Settings';
  const notifButtonLabel =
    notifRequested && !notifPerm.canAskAgain ? 'Open Settings' : 'Turn On';

  const continueTextColor = bothGranted ? '#1C1C1E' : '#8E8E93';
  const continueBg = bothGranted ? '#F9F9F6' : '#3A3A3C';

  if (!fontsLoaded) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable style={styles.backdrop} onPress={handleDismiss}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrapper}>
          <View style={styles.card}>
            {/* X close button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleDismiss}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Feather name="x" size={20} color="#8E8E93" />
            </TouchableOpacity>

            {/* Title */}
            <Text style={styles.title}>FlashLocum needs access</Text>

            {/* Location row */}
            <View style={styles.permRow}>
              <View style={styles.iconCircle}>
                <Feather name="map-pin" size={18} color="#F9F9F6" />
              </View>
              <View style={styles.permTextBlock}>
                <Text style={styles.permLabel}>Location</Text>
                <Text style={styles.permSubtitle}>{locationSubtitle}</Text>
              </View>
              {locationPerm.granted ? (
                <View style={styles.grantedIndicator}>
                  <Text style={styles.checkmark}>✓</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.permButton}
                  onPress={handleLocationPress}
                  disabled={locationPerm.loading}
                  activeOpacity={0.8}
                >
                  {locationPerm.loading ? (
                    <ActivityIndicator size="small" color="#1C1C1E" />
                  ) : (
                    <Text style={styles.permButtonText}>{locationButtonLabel}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Notifications row */}
            <View style={styles.permRow}>
              <View style={styles.iconCircle}>
                <Feather name="bell" size={18} color="#F9F9F6" />
              </View>
              <View style={styles.permTextBlock}>
                <Text style={styles.permLabel}>Notifications</Text>
                <Text style={styles.permSubtitle}>{notifSubtitle}</Text>
              </View>
              {notifPerm.granted ? (
                <View style={styles.grantedIndicator}>
                  <Text style={styles.checkmark}>✓</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.permButton}
                  onPress={handleNotifPress}
                  disabled={notifPerm.loading}
                  activeOpacity={0.8}
                >
                  {notifPerm.loading ? (
                    <ActivityIndicator size="small" color="#1C1C1E" />
                  ) : (
                    <Text style={styles.permButtonText}>{notifButtonLabel}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Continue button */}
            <TouchableOpacity
              style={[styles.continueButton, { backgroundColor: continueBg }]}
              onPress={handleContinue}
              disabled={!bothGranted}
              activeOpacity={0.85}
            >
              <Text style={[styles.continueButtonText, { color: continueTextColor }]}>
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  cardWrapper: {
    width: '100%',
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 28,
    width: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 20,
    marginTop: 4,
    paddingRight: 32,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3A3A3C',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  permTextBlock: {
    flex: 1,
    marginRight: 8,
  },
  permLabel: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  permSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    lineHeight: 16,
  },
  grantedIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  permButton: {
    backgroundColor: '#F9F9F6',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
    flexShrink: 0,
  },
  permButtonText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
    color: '#1C1C1E',
  },
  continueButton: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  continueButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
});

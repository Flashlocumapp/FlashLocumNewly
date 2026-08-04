import React, { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { IS_EXPO_GO } from '@/utils/expoGoGuard';
import AsyncStorage from '@react-native-async-storage/async-storage';

const _playedChimes = new Set<string>();
const CHIME_STORAGE_KEY = '@flashlocum:played_chimes';
AsyncStorage.getItem(CHIME_STORAGE_KEY).then(raw => {
  if (raw) { try { (JSON.parse(raw) as string[]).forEach(k => _playedChimes.add(k)); } catch {} }
}).catch(() => {});

export interface InAppNotification {
  title: string;
  message: string;
}

export interface NotificationContextType {
  hasPermission: boolean;
  permissionDenied: boolean;
  loading: boolean;
  isWeb: boolean;
  requestPermission: () => Promise<boolean>;
  sendTag: (key: string, value: string) => void;
  deleteTag: (key: string) => void;
  lastNotification: Record<string, unknown> | null;
  inAppNotification: InAppNotification | null;
  dismissInAppNotification: () => void;
  playAcceptanceChime: (sessionId: string) => Promise<void>;
  clearChimeForSession: (sessionId: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const PERMISSION_PROMPTED_KEY = 'onesignal_permission_prompted';

const IN_APP_NOTIFICATION_TYPES = ['SHIFT_REMINDER', 'PAYMENT_OVERDUE'] as const;

interface NotificationProviderProps {
  children: ReactNode;
}

// ─── No-op provider used in Expo Go ──────────────────────────────────────────
function ExpoGoNotificationProvider({ children }: NotificationProviderProps) {
  return (
    <NotificationContext.Provider
      value={{
        hasPermission: false,
        permissionDenied: false,
        loading: false,
        isWeb: false,
        requestPermission: async () => false,
        sendTag: () => {},
        deleteTag: () => {},
        lastNotification: null,
        inAppNotification: null,
        dismissInAppNotification: () => {},
        playAcceptanceChime: async (_sessionId: string) => {},
        clearChimeForSession: (_sessionId: string) => {},
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ─── Full OneSignal provider used in native builds ────────────────────────────
function NativeNotificationProvider({ children }: NotificationProviderProps) {
  // Dynamic import so react-native-onesignal is never evaluated in Expo Go
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { OneSignal, LogLevel } = require('react-native-onesignal');

  const router = useRouter();
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prompted, setPrompted] = useState(false);
  const [inAppNotification, setInAppNotification] = useState<InAppNotification | null>(null);

  const dismissInAppNotification = useCallback(() => {
    console.log('[InAppBanner] Dismissed');
    setInAppNotification(null);
  }, []);

  const playNotificationSound = useCallback(() => {
    // No bundled notification sound asset — sound skipped.
    // To enable: add a .mp3 to assets/sounds/ and use expo-av Audio.Sound.createAsync().
    console.log('[InAppBanner] Sound playback skipped (no asset bundled)');
  }, []);

  useEffect(() => {
    const appId: string = Constants.expoConfig?.extra?.oneSignalAppId ?? '';

    OneSignal.Debug.setLogLevel(__DEV__ ? LogLevel.Verbose : LogLevel.None);
    OneSignal.initialize(appId);
    console.log('[OneSignal] Initialized appId=', appId);

    // Android notification channels
    // onesignal-expo-plugin v2 does NOT support androidNotificationChannels or
    // androidDefaultNotificationChannel config options — confirmed by inspecting
    // node_modules/onesignal-expo-plugin/dist/index.js (v2.7.0).
    // react-native-onesignal v5 also does NOT expose a createChannel() runtime API.
    //
    // Android channels must be registered natively. The two required channels are:
    //   • new_coverage_request — vibration ON, default sound, high importance
    //   • default_flashlocum   — vibration OFF, default sound, high importance
    //
    // To register these channels, add expo-notifications and call
    // Notifications.setNotificationChannelAsync() here, or write a custom config plugin.

    const initPermission = async () => {
      const granted = await OneSignal.Notifications.hasPermission();
      setHasPermission(granted);
      console.log('[OneSignal] Permission state: granted=', granted);
      const promptedFlag = await SecureStore.getItemAsync(PERMISSION_PROMPTED_KEY);
      setPrompted(promptedFlag === 'true');
      setLoading(false);
    };
    initPermission();

    const permissionChangeHandler = (granted: boolean) => {
      console.log('[OneSignal] Permission state: granted=', granted);
      setHasPermission(granted);
    };
    OneSignal.Notifications.addEventListener('permissionChange', permissionChangeHandler);

    const foregroundHandler = (event: {
      preventDefault: () => void;
      notification: {
        title?: string;
        body?: string;
        additionalData?: Record<string, unknown>;
      };
    }) => {
      // Always suppress the OS banner
      event.preventDefault();

      const notifType = event.notification.additionalData?.type as string | undefined;
      const title = event.notification.title ?? '';
      const message = event.notification.body ?? '';

      console.log('[OneSignal] Foreground notification received type=', notifType, 'title=', title);

      if (notifType && (IN_APP_NOTIFICATION_TYPES as readonly string[]).includes(notifType)) {
        console.log('[InAppBanner] Showing in-app banner for type=', notifType);
        setInAppNotification({ title, message });
        playNotificationSound();
      } else {
        console.log('[OneSignal] Foreground notification suppressed (type not in allowlist):', title);
      }
    };
    OneSignal.Notifications.addEventListener('foregroundWillDisplay', foregroundHandler as any);

    const clickHandler = async (event: { notification: { title?: string } }) => {
      const title = event.notification.title ?? '';
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          console.log('[OneSignal] Notification tapped but no session — skipping navigation');
          return;
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, doctor_onboarding_complete, requester_onboarding_complete')
          .eq('id', session.user.id)
          .single();
        const dest = profile?.doctor_onboarding_complete ? '/(doctor)/(home)' : '/(requester)/(home)';
        console.log('[OneSignal] Notification tapped title=', title, 'navigating to', dest);
        router.replace(dest as any);
      } catch (err) {
        console.log('[OneSignal] Notification tap navigation error:', err);
      }
    };
    OneSignal.Notifications.addEventListener('click', clickHandler as any);

    const subscriptionChangeHandler = (subscription: { current: { optedIn: boolean; id?: string } }) => {
      console.log('[OneSignal] Subscription change optedIn=', subscription.current.optedIn, 'id=', subscription.current.id);
    };
    OneSignal.User.pushSubscription.addEventListener('change', subscriptionChangeHandler as any);

    return () => {
      OneSignal.Notifications.removeEventListener('permissionChange', permissionChangeHandler);
      OneSignal.Notifications.removeEventListener('foregroundWillDisplay', foregroundHandler as any);
      OneSignal.Notifications.removeEventListener('click', clickHandler as any);
      OneSignal.User.pushSubscription.removeEventListener('change', subscriptionChangeHandler as any);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const permissionDenied = prompted && !hasPermission;

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const { OneSignal: OS } = require('react-native-onesignal');
    console.log('[OneSignal] Permission requested');
    const result = await OS.Notifications.requestPermission(true);
    console.log('[OneSignal] Permission requested result=', result);
    setHasPermission(result);
    await SecureStore.setItemAsync(PERMISSION_PROMPTED_KEY, 'true');
    setPrompted(true);
    return result;
  }, []);

  const sendTag = useCallback((key: string, value: string) => {
    const { OneSignal: OS } = require('react-native-onesignal');
    console.log('[OneSignal] sendTag key=', key, 'value=', value);
    OS.User.addTag(key, value);
  }, []);

  const deleteTag = useCallback((key: string) => {
    const { OneSignal: OS } = require('react-native-onesignal');
    console.log('[OneSignal] deleteTag key=', key);
    OS.User.removeTag(key);
  }, []);

  const playAcceptanceChime = useCallback(async (sessionId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? 'anon';
    const key = `${userId}:${sessionId}`;
    if (_playedChimes.has(key)) return;
    _playedChimes.add(key);
    try { await AsyncStorage.setItem(CHIME_STORAGE_KEY, JSON.stringify(Array.from(_playedChimes))); } catch {}
    try {
      const { Audio } = await import('expo-av');
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/acceptance_chime.mp3'),
        { shouldPlay: true, volume: 1.0 }
      );
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) { sound.unloadAsync().catch(() => {}); }
      });
    } catch (err) { console.warn('[NotificationContext] playAcceptanceChime error:', err); }
  }, []);

  const clearChimeForSession = useCallback((sessionId: string) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user?.id ?? 'anon';
      const key = `${userId}:${sessionId}`;
      _playedChimes.delete(key);
      AsyncStorage.setItem(CHIME_STORAGE_KEY, JSON.stringify(Array.from(_playedChimes))).catch(() => {});
    }).catch(() => {});
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        hasPermission,
        permissionDenied,
        loading,
        isWeb: false,
        requestPermission,
        sendTag,
        deleteTag,
        lastNotification: null,
        inAppNotification,
        dismissInAppNotification,
        playAcceptanceChime,
        clearChimeForSession,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ─── Public export — switches on IS_EXPO_GO ───────────────────────────────────
export function NotificationProvider({ children }: NotificationProviderProps) {
  if (IS_EXPO_GO) {
    return <ExpoGoNotificationProvider>{children}</ExpoGoNotificationProvider>;
  }
  return <NativeNotificationProvider>{children}</NativeNotificationProvider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

import React, { createContext, useContext, useCallback, useEffect, useState, useRef, ReactNode } from 'react';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { Platform, AppState, AppStateStatus } from 'react-native';
// eslint-disable-next-line import/no-unresolved
import * as Notifications from 'expo-notifications';
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
  onNewRequestPush: ((callback: () => void) => () => void) | null;
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
        onNewRequestPush: null,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ─── Full OneSignal provider used in native builds ────────────────────────────
function NativeNotificationProvider({ children }: NotificationProviderProps) {
  // Dynamic import so react-native-onesignal is never evaluated in Expo Go
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const { OneSignal, LogLevel } = require('react-native-onesignal');

  const router = useRouter();
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prompted, setPrompted] = useState(false);
  const [inAppNotification, setInAppNotification] = useState<InAppNotification | null>(null);

  const newRequestPushCallbackRef = useRef<(() => void) | null>(null);
  const soundRef = useRef<import('expo-av').Audio.Sound | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const onNewRequestPush = useCallback((callback: () => void) => {
    newRequestPushCallbackRef.current = callback;
    return () => {
      newRequestPushCallbackRef.current = null;
    };
  }, []);

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

    // Register Android notification channels
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('new_coverage_request', {
        name: 'New Coverage Requests',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
      }).catch(() => {});

      Notifications.setNotificationChannelAsync('default_flashlocum', {
        name: 'FlashLocum Notifications',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        enableVibrate: false,
      }).catch(() => {});
    }

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

      if (notifType === 'NEW_REQUEST') {
        console.log('[OneSignal] NEW_REQUEST push received foregrounded — triggering forceSync via callback');
        newRequestPushCallbackRef.current?.();
        // Do not show banner — silent trigger only
        return;
      }

      if (notifType && (IN_APP_NOTIFICATION_TYPES as readonly string[]).includes(notifType)) {
        console.log('[InAppBanner] Showing in-app banner for type=', notifType);
        setInAppNotification({ title, message });
        playNotificationSound();
      } else {
        console.log('[OneSignal] Foreground notification suppressed (type not in allowlist):', title);
      }
    };
    OneSignal.Notifications.addEventListener('foregroundWillDisplay', foregroundHandler as any);

    const clickHandler = async (event: {
      notification: { title?: string; additionalData?: Record<string, unknown> };
    }) => {
      const data = event.notification.additionalData ?? {};
      const notifType = data.type as string | undefined;
      const targetRole = data.target_role as 'doctor' | 'requester' | undefined;
      const requestId = data.request_id as string | undefined;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('doctor_onboarding_complete, requester_onboarding_complete')
          .eq('id', session.user.id)
          .single();

        const doctorComplete = profile?.doctor_onboarding_complete === true;
        const requesterComplete = profile?.requester_onboarding_complete === true;

        // Resolve destination portal from target_role, falling back to whichever portal is complete
        const resolvedRole: 'doctor' | 'requester' =
          targetRole === 'requester' && requesterComplete ? 'requester'
          : targetRole === 'doctor' && doctorComplete ? 'doctor'
          : doctorComplete ? 'doctor'
          : 'requester';

        console.log('[OneSignal] tap type=', notifType, 'targetRole=', targetRole, 'resolvedRole=', resolvedRole);

        if (notifType === 'REQUEST_EXPIRED' && requestId && resolvedRole === 'requester') {
          // Write intent — requester home reads this on mount and opens config form
          // Key is NOT removed here; removed only after successful restore in requester home
          await AsyncStorage.setItem('@flashlocum:pending_modify_request_id', requestId);
          // For dual-role users: persist requester pathway so navigation guard routes correctly
          await SecureStore.setItemAsync('flashlocum_last_pathway', 'requester');
          router.replace('/(requester)/(home)' as any);
          return;
        }

        // All other notification types — route to correct portal
        router.replace(
          resolvedRole === 'doctor'
            ? '/(doctor)/(home)' as any
            : '/(requester)/(home)' as any
        );
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OneSignal: OS } = require('react-native-onesignal');
    console.log('[OneSignal] sendTag key=', key, 'value=', value);
    OS.User.addTag(key, value);
  }, []);

  const deleteTag = useCallback((key: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OneSignal: OS } = require('react-native-onesignal');
    console.log('[OneSignal] deleteTag key=', key);
    OS.User.removeTag(key);
  }, []);

  const playAcceptanceChime = useCallback(async (sessionId: string) => {
    console.log('[NotificationContext] playAcceptanceChime called — sessionId:', sessionId);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? 'anon';
    const key = `${userId}:${sessionId}`;
    if (_playedChimes.has(key)) {
      console.log('[NotificationContext] playAcceptanceChime skipped — already played for key:', key);
      return;
    }
    _playedChimes.add(key);
    try { await AsyncStorage.setItem(CHIME_STORAGE_KEY, JSON.stringify(Array.from(_playedChimes))); } catch {}
    try {
      console.log('[NotificationContext] playAcceptanceChime — loading audio asset');
      const { Audio } = await import('expo-av');
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      // Unload any previous sound instance before creating a new one
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/acceptance_chime.wav'),
        { shouldPlay: true, volume: 1.0 }
      );
      soundRef.current = sound;
      console.log('[NotificationContext] playAcceptanceChime — sound playing for sessionId:', sessionId);
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          console.log('[NotificationContext] playAcceptanceChime — playback finished, unloading');
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch (err) { console.warn('[NotificationContext] playAcceptanceChime error:', err); }
  }, []);

  // Re-check actual OS notification permission whenever the app returns to foreground.
  // OneSignal's permissionChange event does not fire for changes made in iOS/Android Settings
  // while the app is backgrounded — this AppState listener closes that gap.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { OneSignal: OS } = require('react-native-onesignal');
        const granted: boolean = await OS.Notifications.hasPermission();
        console.log('[OneSignal] AppState foreground re-check — hasPermission=', granted);
        setHasPermission(granted);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
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
        onNewRequestPush,
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

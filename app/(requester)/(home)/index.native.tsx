import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import useSupercluster from 'use-supercluster';
import { useFocusEffect } from '@react-navigation/native';
import { IS_EXPO_GO } from '@/utils/expoGoGuard';
import { useNotifications } from '@/contexts/NotificationContext';
import { useSplash } from '@/app/_layout';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Alert,
  PanResponder,
  TouchableWithoutFeedback,
  Pressable,
  Keyboard,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
  Linking,
  AppState,
  AppStateStatus,
  BackHandler,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Search, MapPin, ArrowRight, X, History, ArrowLeft, Clock } from 'lucide-react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import * as Font from 'expo-font';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { useTabBarVisibility, TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';
import { useAuth } from '@/contexts/AuthContext';
import type { CoverageSession } from '@/contexts/DoctorDispatchContext';
import { getCached, setCached, invalidate } from '@/utils/tabCache';
import PollingManager from '../../../utils/pollingManager';
import { buildShiftPillText, EnvironmentBadge as SessionEnvBadge } from '@/components/sessionUtils';
import { IconSymbol } from '@/components/IconSymbol';
import { SUPABASE_URL } from '@/constants/api';

const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

/**
 * Purge any stale channel with the same topic from Supabase's registry before
 * creating a fresh one. This prevents the "cannot add postgres_changes callbacks
 * after subscribe()" crash that occurs when removeChannel() is async and a new
 * mount fires before the old channel is fully torn down.
 */
function safeChannel(name: string) {
  const existing = supabase.getChannels().find(ch => ch.topic === `realtime:${name}`);
  if (existing) {
    supabase.removeChannel(existing);
  }
  return supabase.channel(name);
}

// ─── Module-level retry flag for handleRequestCoverage ───────────────────────
let _submitRetried = false;
// ─── Module-level idempotency key for submit-request (server-side dedup) ─────
let _submitIdempotencyKey: string | null = null;

// ─── Persistent deduplication for payment success modal ──────────────────────
const REQUESTER_PAID_SESSIONS_KEY = 'requester_paid_sessions_v1';
const REQUESTER_DISMISSED_SESSIONS_KEY = 'requester_dismissed_sessions_v1';
// Layer 1: synchronous in-memory Set — blocks concurrent triggers instantly
const _requesterPaidSessions = new Set<string>();
// Layer 2: in-flight lock — prevents two async checks racing each other
const _requesterRatingInFlight = new Set<string>();
// Sessions dismissed without rating — overlay will NOT re-appear for these
const _requesterDismissedSessions = new Set<string>();

async function markRequesterSessionDismissed(sessionId: string) {
  _requesterDismissedSessions.add(sessionId);
  try {
    const existing = await AsyncStorage.getItem(REQUESTER_DISMISSED_SESSIONS_KEY);
    const arr: string[] = existing ? JSON.parse(existing) : [];
    if (!arr.includes(sessionId)) {
      arr.push(sessionId);
      await AsyncStorage.setItem(REQUESTER_DISMISSED_SESSIONS_KEY, JSON.stringify(arr.slice(-50)));
    }
  } catch {}
}

async function markRequesterSessionPaid(sessionId: string) {
  _requesterPaidSessions.add(sessionId);
  _requesterRatingInFlight.delete(sessionId);
  try {
    const existing = await AsyncStorage.getItem(REQUESTER_PAID_SESSIONS_KEY);
    const arr: string[] = existing ? JSON.parse(existing) : [];
    if (!arr.includes(sessionId)) {
      arr.push(sessionId);
      await AsyncStorage.setItem(REQUESTER_PAID_SESSIONS_KEY, JSON.stringify(arr.slice(-50)));
    }
  } catch {}
}

async function isRequesterSessionPaid(sessionId: string): Promise<boolean> {
  // Synchronous check first — no async gap
  if (_requesterPaidSessions.has(sessionId)) return true;
  // NOTE: do NOT check _requesterRatingInFlight here — the in-flight lock is checked
  // at every call site before calling this function. Checking it inside would cause
  // the first trigger to return "already handled" and permanently block the card.
  try {
    const existing = await AsyncStorage.getItem(REQUESTER_PAID_SESSIONS_KEY);
    const arr: string[] = existing ? JSON.parse(existing) : [];
    if (arr.includes(sessionId)) {
      _requesterPaidSessions.add(sessionId);
      return true;
    }
  } catch {}
  return false;
}

async function warmRequesterPaidCache() {
  try {
    const [paidRaw, dismissedRaw] = await Promise.all([
      AsyncStorage.getItem(REQUESTER_PAID_SESSIONS_KEY),
      AsyncStorage.getItem(REQUESTER_DISMISSED_SESSIONS_KEY),
    ]);
    const paidArr: string[] = paidRaw ? JSON.parse(paidRaw) : [];
    paidArr.forEach(id => _requesterPaidSessions.add(id));
    const dismissedArr: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : [];
    dismissedArr.forEach(id => _requesterDismissedSessions.add(id));
  } catch {}
}

// Module-level flag — survives tab switches / screen remounts
let _hasInitialFix = false;
// Module-level coord cache — survives tab switches (screen remounts)
let _cachedRequesterCoords: { latitude: number; longitude: number } | null = null;
// Module-level region cache — preserves zoom/pan across tab switches on Android
let _cachedRequesterRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null = null;
// Module-level session cache — survives tab switches / screen remounts
let _cachedActiveSession: CoverageSession | null = undefined as any; // undefined = never fetched, null = fetched but no session
let _sessionCachePopulated = false;

const ANDROID_KEY = 'AIzaSyACeTm0j_ajj-rRObPbkDBJvW6GVBt6SMU';
const IOS_KEY = 'AIzaSyBFC2FPkzjooOJhFwkMsM_o3qQiTOn0rZk';
const MAPS_KEY = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;



const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const MAP_LAT_OFFSET = -0.03;  // shifts centre south → pin appears higher
const MAP_LNG_OFFSET = 0.03;   // shifts centre east → pin appears to the left

const LAGOS_BOUNDS = {
  northeast: { lat: 6.7027, lng: 3.7042 },
  southwest: { lat: 6.3933, lng: 2.7076 },
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SHEET_HEIGHTS = {
  idle: 140 + 80,
  searching: SCREEN_HEIGHT * 0.75,
  config: SCREEN_HEIGHT * 0.75,
  summary: 240 + 80,
  matching: 300 + 80,
};

type SheetState = 'idle' | 'searching' | 'config' | 'summary' | 'matching';

type SelectedPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

const MINIMALIST_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#F0F4F8' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F0F4F8' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#C5D0DC' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E8EFF5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'poi.park', elementType: 'labels.text.stroke', stylers: [{ color: '#F0F4F8' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#E2E6EA' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#D8DDE3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#C8CDD3' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#BCC3CA' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#87CEEB' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry.stroke', stylers: [{ color: '#4169E1' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#EDF1F5' }] },
];

// ─── Custom Time Picker ───────────────────────────────────────────────────────
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1–12
const AMPM = ['AM', 'PM'];
const MINUTES = [0, 15, 30, 45];
const ITEM_HEIGHT = 48;

function CustomTimePicker({
  visible,
  initialTime,
  onDone,
  onCancel,
  isForDate,
  shiftDate,
  isEndTime = false,
}: {
  visible: boolean;
  initialTime: Date;
  onDone: (date: Date) => void;
  onCancel: () => void;
  isForDate: Date;
  shiftDate: Date;
  isEndTime?: boolean;
}) {
  const [selectedHour, setSelectedHour] = useState(() => {
    const h = initialTime.getHours();
    if (h === 0) return 12;
    if (h > 12) return h - 12;
    return h;
  });
  const [selectedMinute, setSelectedMinute] = useState(() => {
    const m = initialTime.getMinutes();
    // snap to nearest 15
    return MINUTES.reduce((prev, curr) => Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev, 0);
  });
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>(() => {
    return initialTime.getHours() < 12 ? 'AM' : 'PM';
  });

  const hourListRef = useRef<FlatList<number>>(null);
  const minuteListRef = useRef<FlatList<number>>(null);
  const ampmListRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (visible) {
      const h24 = initialTime.getHours();
      const ampm = h24 < 12 ? 'AM' : 'PM';
      const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
      const rawM = initialTime.getMinutes();
      const snappedM = MINUTES.reduce((prev, curr) => Math.abs(curr - rawM) < Math.abs(prev - rawM) ? curr : prev, 0);
      setSelectedHour(h12);
      setSelectedAmPm(ampm);
      setSelectedMinute(snappedM);
      setTimeout(() => {
        hourListRef.current?.scrollToIndex({ index: h12 - 1, animated: false });
        const mIdx = MINUTES.indexOf(snappedM);
        minuteListRef.current?.scrollToIndex({ index: mIdx >= 0 ? mIdx : 0, animated: false });
        ampmListRef.current?.scrollToIndex({ index: ampm === 'AM' ? 0 : 1, animated: false });
      }, 100);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDone = () => {
    // Convert 12h + AM/PM to 24h
    let h24: number;
    if (selectedAmPm === 'AM') {
      h24 = selectedHour === 12 ? 0 : selectedHour;
    } else {
      h24 = selectedHour === 12 ? 12 : selectedHour + 12;
    }
    // WAT validation (only for start time, not end time — end time can be next day)
    if (!isEndTime) {
      const now = new Date();
      const shiftDateStr = shiftDate.toISOString().split('T')[0];
      const watTodayStr = now.toISOString().split('T')[0];
      if (shiftDateStr === watTodayStr) {
        const watHour = now.getUTCHours();
        const watMinute = now.getUTCMinutes();
        if (h24 < watHour || (h24 === watHour && selectedMinute <= watMinute)) {
          Alert.alert('Invalid Time', 'Please select a future time.');
          return;
        }
      }
    }
    const result = new Date(isForDate);
    result.setHours(h24, selectedMinute, 0, 0);
    onDone(result);
  };

  const insets = useSafeAreaInsets();

  const renderHourItem = ({ item }: { item: number }) => {
    const isSelected = item === selectedHour;
    const label = item.toString().padStart(2, '0');
    return (
      <TouchableOpacity
        onPress={() => {
          setSelectedHour(item);
        }}
        style={{
          height: ITEM_HEIGHT,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isSelected ? '#0A0A0A' : 'transparent',
          borderRadius: 12,
          marginHorizontal: 4,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: isSelected ? '700' : '400', color: isSelected ? '#FFFFFF' : COLORS.text }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderMinuteItem = ({ item }: { item: number }) => {
    const isSelected = item === selectedMinute;
    const label = item.toString().padStart(2, '0');
    return (
      <TouchableOpacity
        onPress={() => {
          setSelectedMinute(item);
        }}
        style={{
          height: ITEM_HEIGHT,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isSelected ? '#0A0A0A' : 'transparent',
          borderRadius: 12,
          marginHorizontal: 4,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: isSelected ? '700' : '400', color: isSelected ? '#FFFFFF' : COLORS.text }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
              <TouchableOpacity onPress={onCancel}>
                <Text style={{ fontSize: 16, color: COLORS.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text }}>Select Time</Text>
              <TouchableOpacity onPress={handleDone}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#1C1C1E' }}>Done</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}>
              {/* Hour column */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'center', marginBottom: 8, letterSpacing: 0.8 }}>
                  HOUR
                </Text>
                <FlatList
                  ref={hourListRef}
                  data={HOURS}
                  keyExtractor={(item) => String(item)}
                  renderItem={renderHourItem}
                  snapToInterval={ITEM_HEIGHT}
                  decelerationRate="fast"
                  showsVerticalScrollIndicator={false}
                  style={{ height: ITEM_HEIGHT * 5 }}
                  getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                  onScrollToIndexFailed={() => {}}
                />
              </View>

              {/* Separator */}
              <View style={{ justifyContent: 'center', paddingBottom: 8 }}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: COLORS.text }}>:</Text>
              </View>

              {/* Minute column */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'center', marginBottom: 8, letterSpacing: 0.8 }}>
                  MIN
                </Text>
                <FlatList
                  ref={minuteListRef}
                  data={MINUTES}
                  keyExtractor={(item) => String(item)}
                  renderItem={renderMinuteItem}
                  snapToInterval={ITEM_HEIGHT}
                  decelerationRate="fast"
                  showsVerticalScrollIndicator={false}
                  style={{ height: ITEM_HEIGHT * 4 }}
                  getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                  onScrollToIndexFailed={() => {}}
                />
              </View>

              {/* AM/PM column */}
              <View style={{ width: 64 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'center', marginBottom: 8, letterSpacing: 0.8 }}>
                  AM/PM
                </Text>
                <FlatList
                  ref={ampmListRef}
                  data={AMPM}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => {
                    const isSelected = item === selectedAmPm;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedAmPm(item as 'AM' | 'PM');
                        }}
                        style={{
                          height: ITEM_HEIGHT,
                          justifyContent: 'center',
                          alignItems: 'center',
                          backgroundColor: isSelected ? '#0A0A0A' : 'transparent',
                          borderRadius: 12,
                          marginHorizontal: 4,
                        }}
                      >
                        <Text style={{ fontSize: 18, fontWeight: isSelected ? '700' : '400', color: isSelected ? '#FFFFFF' : COLORS.text }}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                  snapToInterval={ITEM_HEIGHT}
                  decelerationRate="fast"
                  showsVerticalScrollIndicator={false}
                  style={{ height: ITEM_HEIGHT * 2 }}
                  getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                  onScrollToIndexFailed={() => {}}
                />
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}



function DragHandle({ panHandlers }: { panHandlers?: object }) {
  return (
    <View {...panHandlers} style={{ alignItems: 'center', paddingVertical: 8 }}>
      <View style={{ width: 36, height: 4, borderRadius: 99, backgroundColor: '#DEDEDE' }} />
    </View>
  );
}

// ─── Session helpers ──────────────────────────────────────────────────────────

function formatSessionTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatElapsedSession(startedAt: string): string {
  const diffMs = Date.now() - new Date(startedAt).getTime();
  const totalSec = Math.max(0, Math.floor(diffMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ].join(':');
}

function formatCountdown(deadlineAt: string): string {
  const diffMs = new Date(deadlineAt).getTime() - Date.now();
  if (diffMs <= 0) return '00:00';
  const totalSec = Math.floor(diffMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatNaira(kobo: number): string {
  const naira = Math.round(kobo / 100);
  return `₦${naira.toLocaleString()}`;
}

function getSessionInitials(name: string): string {
  if (name.includes('@')) {
    const username = name.split('@')[0];
    const firstChar = username[0]?.toUpperCase() ?? 'D';
    const secondChar = username[1]?.toUpperCase() ?? firstChar;
    return firstChar + secondChar;
  }
  const parts = name.replace(/^Dr\.?\s*/i, '').trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? '?';
}

// buildShiftPillText and SessionEnvBadge are imported from shared sessionUtils below

// ─── Requester Upcoming Coverage Card ────────────────────────────────────────
function RequesterUpcomingCard({
  session,
  onCancel,
  onCall,
  onStartShift,
  onResumeShift,
  onEndShift,
  bottomPadding,
  startShiftDisabled,
  resumeShiftDisabled,
}: {
  session: CoverageSession;
  onCancel: () => void;
  onCall: () => void;
  onStartShift: () => void;
  onResumeShift: () => void;
  onEndShift: () => void;
  bottomPadding: number;
  startShiftDisabled?: boolean;
  resumeShiftDisabled?: boolean;
}) {
  const isPaused = session.status === 'paused';
  const canCancel = session.status === 'upcoming' && session.current_day === 1;
  const shiftPillText = buildShiftPillText(session);
  const rawDoctorName = session.doctor_name || '';
  // Strip any existing Dr. prefix then re-apply exactly once
  const cleanName = rawDoctorName.replace(/^dr\.?\s*/i, '').trim();
  const doctorName = cleanName && !cleanName.includes('@') ? `Dr. ${cleanName}` : 'Doctor';
  const initials = cleanName ? getSessionInitials(cleanName) : 'DR';

  // Frozen session snapshot — never re-fetches, never blinks
  const ratingDisplay = session.doctor_rating != null ? Number(session.doctor_rating).toFixed(2) : '5.00';
  const reliabilityDisplay = session.doctor_reliability != null ? `${Math.round(Number(session.doctor_reliability))}` : '100';

  return (
    <View style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: '#1C1C1E',
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingTop: 16, paddingHorizontal: 16,
      paddingBottom: bottomPadding,
      shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.08, shadowRadius: 10, elevation: 10,
    }}>
      {/* Drag handle */}
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <View style={{ width: 40, height: 5, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
      </View>

      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold' }}>
          UPCOMING COVERAGE
        </Text>
        <SessionEnvBadge environment={session.environment} />
      </View>

      {/* Doctor row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' }}>
          {session.doctor_avatar ? (
            <Image source={{ uri: session.doctor_avatar }} style={{ width: 52, height: 52, borderRadius: 26 }} />
          ) : (
            <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>{initials}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          {/* Name + rating on same line */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF', flexShrink: 1 }} numberOfLines={1}>
              {doctorName}
            </Text>
            <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginHorizontal: 5 }}>{'|'}</Text>
            <Text style={{ fontSize: 12, color: '#F4A261' }}>{'★ '}</Text>
            <Text style={{ fontSize: 12, color: '#F4A261', fontFamily: 'Inter_600SemiBold' }}>{ratingDisplay}</Text>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#34C759', marginHorizontal: 5 }} />
            <Text style={{ fontSize: 12, color: '#34C759', fontFamily: 'Inter_600SemiBold' }}>
              {reliabilityDisplay}
            </Text>
            <Text style={{ fontSize: 12, color: '#34C759', fontFamily: 'Inter_600SemiBold' }}>{'%'}</Text>
          </View>
          {/* MDCN below */}
          <Text style={{ fontSize: 12, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginTop: 2 }}>
            {session.doctor_mdcn || 'MDCN/R/—'}
          </Text>
        </View>
      </View>

      {/* Shift pill */}
      <View style={{ backgroundColor: '#2C2C2E', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, width: '100%', marginBottom: 14 }}>
        <Text style={{ fontSize: 12, color: '#FFFFFF', fontFamily: 'Inter_400Regular', lineHeight: 18 }}>{shiftPillText}</Text>
      </View>

      {/* Action buttons */}
      {!isPaused ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {canCancel && (
            <TouchableOpacity onPress={() => { onCancel(); }}
              activeOpacity={0.8}
              style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }}>CANCEL SHIFT</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => { onCall(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#0A0A0A', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>CALL</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onStartShift(); }}
            activeOpacity={0.8}
            disabled={startShiftDisabled}
            style={{ flex: 1, backgroundColor: '#34C759', borderRadius: 999, paddingVertical: 12, alignItems: 'center', opacity: startShiftDisabled ? 0.70 : 1 }}>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#1C1C1E' }}>START SHIFT</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => { onEndShift(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#FF3B30', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>END SHIFT</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onCall(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#0A0A0A', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>CALL</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onResumeShift(); }}
            activeOpacity={0.8}
            disabled={resumeShiftDisabled}
            style={{ flex: 1, backgroundColor: '#34C759', borderRadius: 999, paddingVertical: 12, alignItems: 'center', opacity: resumeShiftDisabled ? 0.70 : 1 }}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#1C1C1E' }}>RESUME SHIFT</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Requester Active Coverage Card ──────────────────────────────────────────
function RequesterActiveCard({
  session,
  onCall,
  onPauseShift,
  onEndShift,
  bottomPadding,
}: {
  session: CoverageSession;
  onCall: () => void;
  onPauseShift: () => void;
  onEndShift: () => void;
  bottomPadding: number;
}) {
  const [elapsed, setElapsed] = useState('00:00:00');

  const currentDayLog = session.day_logs?.[session.current_day - 1];
  const startedAt = currentDayLog?.started_at ?? session.started_at;

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(formatElapsedSession(startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const rawDoctorName = session.doctor_name || '';
  // Strip any existing Dr. prefix then re-apply exactly once
  const cleanName = rawDoctorName.replace(/^dr\.?\s*/i, '').trim();
  const doctorName = cleanName && !cleanName.includes('@') ? `Dr. ${cleanName}` : 'Doctor';
  const initials = cleanName ? getSessionInitials(cleanName) : 'DR';

  // Frozen session snapshot — never re-fetches, never blinks
  const ratingDisplay = session.doctor_rating != null ? Number(session.doctor_rating).toFixed(2) : '5.00';
  const reliabilityDisplay = session.doctor_reliability != null ? `${Math.round(Number(session.doctor_reliability))}` : '100';
  const shiftPillText = buildShiftPillText(session);
  const showDayPill = session.coverage_length > 1;
  const dayPillText = `Day ${session.current_day} of ${session.coverage_length}`;
  const isLastDay = session.current_day >= session.coverage_length;
  const showPauseButton = session.coverage_length > 1 && !isLastDay;

  return (
    <View style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: '#1C1C1E',
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingTop: 16, paddingHorizontal: 16,
      paddingBottom: bottomPadding,
      shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.08, shadowRadius: 10, elevation: 10,
    }}>
      {/* Drag handle */}
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <View style={{ width: 40, height: 5, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
      </View>

      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold' }}>
          ACTIVE COVERAGE
        </Text>
        <SessionEnvBadge environment={session.environment} />
      </View>

      {/* Doctor row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' }}>
          {session.doctor_avatar ? (
            <Image source={{ uri: session.doctor_avatar }} style={{ width: 52, height: 52, borderRadius: 26 }} />
          ) : (
            <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>{initials}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          {/* Name + rating on same line */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF', flexShrink: 1 }} numberOfLines={1}>
              {doctorName}
            </Text>
            <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginHorizontal: 5 }}>{'|'}</Text>
            <Text style={{ fontSize: 12, color: '#F4A261' }}>{'★ '}</Text>
            <Text style={{ fontSize: 12, color: '#F4A261', fontFamily: 'Inter_600SemiBold' }}>{ratingDisplay}</Text>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#34C759', marginHorizontal: 5 }} />
            <Text style={{ fontSize: 12, color: '#34C759', fontFamily: 'Inter_600SemiBold' }}>
              {reliabilityDisplay}
            </Text>
            <Text style={{ fontSize: 12, color: '#34C759', fontFamily: 'Inter_600SemiBold' }}>{'%'}</Text>
          </View>
          {/* MDCN below */}
          <Text style={{ fontSize: 12, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginTop: 2 }}>
            {session.doctor_mdcn || 'MDCN/R/—'}
          </Text>
        </View>
      </View>

      {/* Shift pill */}
      <View style={{ backgroundColor: '#2C2C2E', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, width: '100%', marginBottom: 10 }}>
        <Text style={{ fontSize: 12, color: '#FFFFFF', fontFamily: 'Inter_400Regular', lineHeight: 18 }}>{shiftPillText}</Text>
      </View>

      {/* Timer row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13, color: '#8E8E93' }}>⏱</Text>
          <Text style={{ fontSize: 22, color: '#FFFFFF', fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>{elapsed}</Text>
        </View>
        {showDayPill && (
          <View style={{ backgroundColor: '#1A3A2A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: '#34C759', fontFamily: 'Inter_600SemiBold' }}>{dayPillText}</Text>
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity onPress={() => { onEndShift(); }}
          activeOpacity={0.8}
          style={{ flex: 1, backgroundColor: '#FF3B30', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>END SHIFT</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { onCall(); }}
          activeOpacity={0.8}
          style={{ flex: 1, backgroundColor: '#0A0A0A', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>CALL</Text>
        </TouchableOpacity>
        {showPauseButton && (
          <TouchableOpacity onPress={() => { onPauseShift(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }}>PAUSE SHIFT</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Payment Screen ───────────────────────────────────────────────────────────
function RequesterPaymentCard({
  session,
  bottomPadding,
  onPaymentConfirmed,
  initialPayment,
}: {
  session: CoverageSession;
  bottomPadding: number;
  onPaymentConfirmed: () => void;
  initialPayment?: {
    account_number: string;
    bank_name: string;
    account_name: string | null;
    account_reference: string;
    expiry_at: string;
    amount_naira: number;
    payment_route?: string | null;
  } | null;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Payment intent state — always sourced from backend
  const [paymentIntent, setPaymentIntent] = useState<import('@/types').PaymentIntent | null>(null);
  const paymentIntentRef = useRef<import('@/types').PaymentIntent | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(true);
  const autoRefreshAttemptedRef = useRef(false);
  const refreshingRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  // Manual payment claim state
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  // paymentConfirmed is now driven entirely by the parent via onPaymentConfirmed

  // Route-based rendering — manual FlashLocum route hides countdown and shows claim button
  const isManualRoute = paymentIntent?.payment_route === 'flashlocum_manual';

  // Countdown state — recalculated from expiry_at, never persisted
  const [countdown, setCountdown] = useState('--:--');
  const [countdownColor, setCountdownColor] = useState('#000000');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryRef = useRef<string | null>(null);
  const handleRefreshPaymentRef = useRef<() => Promise<void>>(async () => {});

  const skeletonAnim = useRef(new Animated.Value(0.4)).current;

  // ─── Skeleton pulse ───────────────────────────────────────────────────────
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(skeletonAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [skeletonAnim]);

  // Sync claimed state from paymentIntent (handles screen re-open after claim)
  useEffect(() => {
    if (paymentIntent?.requester_claimed) {
      setClaimed(true);
    }
  }, [paymentIntent?.requester_claimed]);

  // ─── Start countdown from expiry_at ──────────────────────────────────────
  const startCountdown = useCallback((expiryAt: string) => {
    expiryRef.current = expiryAt;
    if (timerRef.current) clearInterval(timerRef.current);

    const tick = () => {
      const diffMs = new Date(expiryRef.current!).getTime() - Date.now();
      if (diffMs <= 0) {
        setCountdown('00:00');
        setCountdownColor('#FF3B30');
        if (timerRef.current) clearInterval(timerRef.current);
        // Auto-refresh when timer hits zero
        handleRefreshPaymentRef.current();
        return;
      }
      const totalSec = Math.floor(diffMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      setCountdown(formatted);
      // Color shifts: orange < 3min, red < 1min
      if (totalSec < 60) {
        setCountdownColor('#FF3B30');
      } else if (totalSec < 180) {
        setCountdownColor('#FF9500');
      } else {
        setCountdownColor('#000000');
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Fetch payment intent from Supabase (with retry loop) ───────────────
  const fetchPaymentIntent = useCallback(async () => {
    setLoadingIntent(true);
    const MAX_ATTEMPTS = 15; // 15 × 2s = 30s
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const { data } = await supabase
          .from('payment_intents')
          .select('*')
          .eq('session_id', session.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (data) {
          // Row found — check if account details are populated
          if (data.monnify_account_number) {
            // Happy path — account details present
            setPaymentIntent(data as import('@/types').PaymentIntent);
            if (data.payment_route !== 'flashlocum_manual') {
              startCountdown(data.expiry_at);
            }
            setLoadingIntent(false);
            return;
          } else if (!autoRefreshAttemptedRef.current && data.payment_route !== 'flashlocum_manual') {
            // Row exists but Monnify failed — auto-trigger refresh once
            autoRefreshAttemptedRef.current = true;
            setLoadingIntent(false);
            setPaymentIntent(data as import('@/types').PaymentIntent);
            // Trigger refresh after a short delay to let the UI settle
            setTimeout(() => { handleRefreshPaymentRef.current(); }, 500);
            return;
          } else {
            // Already tried refresh — stop retrying
            setPaymentIntent(data as import('@/types').PaymentIntent);
            setLoadingIntent(false);
            return;
          }
        }
        // No row yet — wait 2s and retry (unless last attempt)
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e: any) {
        // Network error — wait 2s and retry
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    // Exhausted all retries — stop loading, leave paymentIntent null
    setLoadingIntent(false);
  }, [session.id, startCountdown]);

  // ─── Refresh payment via edge function ───────────────────────────────────
  const handleRefreshPayment = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const res = await fetchWithAuth(`${SUPABASE_URL}/functions/v1/refresh-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      const payment = data?.payment;
      if (payment) {
        const snap = paymentIntentRef.current;
        const base = snap ?? {
          id: '',
          session_id: session.id,
          amount_naira: payment.amount_naira ?? 0,
          monnify_account_number: null,
          monnify_bank_name: null,
          monnify_account_name: null,
          monnify_account_reference: null,
          monnify_transaction_reference: null,
          status: 'pending' as const,
          expiry_at: payment.expiry_at ?? new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setPaymentIntent({
          ...base,
          id: payment.id ?? base.id,
          amount_naira: payment.amount_naira ?? base.amount_naira,
          monnify_account_number: payment.account_number ?? base.monnify_account_number,
          monnify_bank_name: payment.bank_name ?? base.monnify_bank_name,
          monnify_account_name: payment.account_name ?? base.monnify_account_name ?? null,
          monnify_account_reference: payment.account_reference ?? base.monnify_account_reference,
          expiry_at: payment.expiry_at ?? base.expiry_at,
          payment_route: payment.payment_route ?? base.payment_route ?? null,
        });
        if (payment.expiry_at && payment.payment_route !== 'flashlocum_manual') {
          startCountdown(payment.expiry_at);
        }
        setLoadingIntent(false);
        autoRefreshAttemptedRef.current = false;
      }
    } catch {
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [session.id, startCountdown]);

  // Keep paymentIntentRef in sync so updaters can read the latest value without stale closures.
  useEffect(() => { paymentIntentRef.current = paymentIntent; }, [paymentIntent]);

  // Keep ref in sync with latest handleRefreshPayment so startCountdown's tick
  // always calls the version that has the current paymentIntent in scope.
  // useLayoutEffect runs synchronously before paint, ensuring the ref is populated
  // before any setTimeout (e.g. the 500ms retry in fetchPaymentIntent) can fire.
  useLayoutEffect(() => {
    handleRefreshPaymentRef.current = handleRefreshPayment;
  }, [handleRefreshPayment]);

  // ─── On mount: seed from initialPayment or fetch from DB ─────────────────
  useEffect(() => {
    // Apply initialPayment if it arrives and we don't yet have account details
    if (initialPayment?.account_number && !paymentIntentRef.current?.monnify_account_number) {
      const pi: import('@/types').PaymentIntent = {
        id: '',
        session_id: session.id,
        amount_naira: initialPayment.amount_naira,
        monnify_account_number: initialPayment.account_number,
        monnify_bank_name: initialPayment.bank_name,
        monnify_account_name: initialPayment.account_name ?? null,
        monnify_account_reference: initialPayment.account_reference,
        monnify_transaction_reference: null,
        status: 'pending',
        expiry_at: initialPayment.expiry_at,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payment_route: initialPayment.payment_route ?? null,
        requester_claimed: false,
        claimed_at: null,
      };
      setPaymentIntent(pi);
      startCountdown(initialPayment.expiry_at);
      setLoadingIntent(false);
      // NOTE: do NOT return here — fall through to register AppState listener
    } else if (!paymentIntentRef.current?.monnify_account_number) {
      // No initialPayment and no account details yet — fetch from DB
      fetchPaymentIntent();
    }

    // Always register AppState listener for background recovery
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const pi = paymentIntentRef.current;
        if (!pi?.monnify_account_number) {
          fetchPaymentIntent();
        } else if (pi.expiry_at && new Date(pi.expiry_at) < new Date() && pi.payment_route !== 'flashlocum_manual') {
          // Account details exist but window has expired — auto-refresh once
          handleRefreshPaymentRef.current();
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      sub.remove();
    };
  }, [initialPayment]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cleanup timer on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ─── One-time mount check: catches payment that happened while app was backgrounded ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('coverage_sessions')
          .select('status')
          .eq('id', session.id)
          .single();
        const rawStatus = data?.status as string | undefined;
        if (!cancelled && rawStatus && (
          rawStatus === 'requester_paid' ||
          rawStatus === 'settled' ||
          rawStatus === 'disbursed'
        )) {
          if (timerRef.current) clearInterval(timerRef.current);
          onPaymentConfirmed();
        }
      } catch (e: any) {
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Realtime: session:<sessionId> — payment_refreshed only ─────────────
  // payment_confirmed / PAYMENT_CONFIRMED are handled by the parent's
  // requester-user channel and session channel; parent calls onPaymentConfirmed.
  useEffect(() => {
    const channelName = `session:${session.id}`;

    const ch = supabase.channel(channelName)
      .on('broadcast', { event: 'payment_refreshed' }, (payload) => {
        const payment = payload?.payload?.payment;
        if (payment) {
          const snap = paymentIntentRef.current;
          const base = snap ?? {
            id: '',
            session_id: session.id,
            amount_naira: payment.amount_naira ?? 0,
            monnify_account_number: null,
            monnify_bank_name: null,
            monnify_account_name: null,
            monnify_account_reference: null,
            monnify_transaction_reference: null,
            status: 'pending' as const,
            expiry_at: payment.expiry_at ?? new Date(Date.now() + 20 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          setPaymentIntent({
            ...base,
            id: payment.id ?? base.id,
            amount_naira: payment.amount_naira ?? base.amount_naira,
            monnify_account_number: payment.account_number ?? base.monnify_account_number,
            monnify_bank_name: payment.bank_name ?? base.monnify_bank_name,
            monnify_account_name: payment.account_name ?? base.monnify_account_name ?? null,
            monnify_account_reference: payment.account_reference ?? base.monnify_account_reference,
            expiry_at: payment.expiry_at ?? base.expiry_at,
          });
          if (payment.expiry_at && payment.payment_route !== 'flashlocum_manual') {
            startCountdown(payment.expiry_at);
          }
          setLoadingIntent(false);
        }
      })
      .subscribe((status) => {
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [session.id, startCountdown]);

  // ─── postgres_changes on payment_intents — guaranteed delivery path ──────
  // Fires when end-shift inserts the row, independent of broadcast timing.
  // Covers app-restart and background-recovery scenarios.
  useEffect(() => {
    const ch = supabase
      .channel(`payment-intents-watch:${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'payment_intents',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          const row = payload.new as import('@/types').PaymentIntent;
          console.log('[RequesterPaymentCard] payment_intents INSERT via postgres_changes — account_number:', row.monnify_account_number);
          if (row.monnify_account_number) {
            setPaymentIntent(row);
            if (row.payment_route !== 'flashlocum_manual') {
              startCountdown(row.expiry_at);
            }
            setLoadingIntent(false);
          } else if (!autoRefreshAttemptedRef.current) {
            // Row inserted but Monnify failed — auto-refresh once
            autoRefreshAttemptedRef.current = true;
            setPaymentIntent(row);
            setLoadingIntent(false);
            setTimeout(() => { handleRefreshPaymentRef.current(); }, 500);
          }
        }
      )
      // Fix 2: also listen for UPDATE events to catch partial payment DB writes
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payment_intents',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          const row = payload.new as import('@/types').PaymentIntent;
          console.log('[RequesterPaymentCard] payment_intents UPDATE via postgres_changes — amount_naira:', row.amount_naira, 'amount_paid:', row.amount_paid, 'outstanding_balance:', row.outstanding_balance);
          // Merge updated fields — do NOT restart the countdown timer
          setPaymentIntent(prev => prev ? { ...prev, ...row } : row);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [session.id, startCountdown]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived display values ───────────────────────────────────────────────
  const amountNaira = paymentIntent?.amount_naira ?? (session as any).booked_price ?? session.price;
  const amountResolved = (amountNaira != null && isFinite(Number(amountNaira))) ? Number(amountNaira) : null;
  const amountDisplay = amountResolved !== null ? `₦${amountResolved.toLocaleString()}` : '—';
  const hasAccountDetails = !!(paymentIntent?.monnify_account_number);
  const accountNumber = paymentIntent?.monnify_account_number ?? '';
  const bankName = paymentIntent?.monnify_bank_name ?? '';
  const copyLabel = copied ? 'Copied!' : 'Copy';

  const countdownDisplay = refreshing ? 'Refreshing...' : countdown;
  const isLoading = loadingIntent && !paymentIntent;
  const hasExhaustedRetry = !loadingIntent && !paymentIntent?.monnify_account_number && !refreshing;

  const handleCopy = async () => {
    console.log('[RequesterPaymentCard] handleCopy: copying account number');
    await Clipboard.setStringAsync(accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClaimPayment = async () => {
    if (claiming || claimed) return;
    console.log('[RequesterPaymentCard] handleClaimPayment: user pressed I Have Made Payment');
    setClaiming(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      console.log('[RequesterPaymentCard] handleClaimPayment: calling claim-manual-payment edge function');
      const res = await fetch(
        `${EDGE_BASE}/claim-manual-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: session.id }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('[RequesterPaymentCard] claim-manual-payment error:', err);
      }
      // Transition to awaiting confirmation regardless — optimistic
      setClaimed(true);
    } catch (e) {
      console.warn('[RequesterPaymentCard] handleClaimPayment exception:', e);
      setClaimed(true); // Still transition — don't leave user stuck
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Modal
      visible={session.status === 'payment_pending'}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 32,
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 32,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Text style={{
            fontSize: 11,
            letterSpacing: 1.4,
            color: '#8E8E93',
            fontFamily: 'Inter_600SemiBold',
            marginBottom: 6,
            textTransform: 'uppercase',
          }}>
            COMPLETE COVERAGE
          </Text>
          <Text style={{
            fontSize: 16,
            color: '#8E8E93',
            fontFamily: 'Inter_400Regular',
            marginBottom: 8,
          }}>
            Transfer Exactly
          </Text>

          {/* Amount — falls back to session.price immediately, updates when paymentIntent loads */}
          <Text style={{
            fontSize: 56,
            fontFamily: 'Inter_700Bold',
            color: '#000000',
            marginBottom: 28,
            letterSpacing: -1,
          }}>
            {amountDisplay}
          </Text>

          {/* Refreshing overlay */}
          {refreshing && (
            <View style={{
              backgroundColor: '#FFF9E6',
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}>
              <ActivityIndicator size="small" color="#FF9500" />
              <Text style={{ fontSize: 14, color: '#FF9500', fontFamily: 'Inter_600SemiBold' }}>
                Refreshing payment details...
              </Text>
            </View>
          )}



          {/* Account Card */}
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 2,
          }}>
            {/* Bank Row */}
            <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold', marginBottom: 6 }}>
              BANK
            </Text>
            <Text style={{ fontSize: 17, fontFamily: 'Inter_600SemiBold', color: loadingIntent ? '#8E8E93' : '#000000', marginBottom: 16 }}>
              {loadingIntent ? 'Generating...' : (bankName || '—')}
            </Text>

            <View style={{ height: 1, backgroundColor: '#F2F2F7', marginBottom: 16 }} />

            {/* Account Number Row */}
            <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold', marginBottom: 6 }}>
              ACCOUNT NUMBER
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              {loadingIntent ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator size="small" color="#8E8E93" />
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_400Regular', color: '#8E8E93' }}>
                    Generating payment account...
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 28, fontFamily: 'Inter_700Bold', color: '#000000', letterSpacing: 1 }}>
                  {accountNumber || '— — — —'}
                </Text>
              )}
              {!loadingIntent && !!accountNumber && (
                <TouchableOpacity
                  onPress={handleCopy}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#E5E5EA',
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    gap: 6,
                  }}
                >
                  <Ionicons name="copy-outline" size={14} color="#3C3C43" />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#3C3C43' }}>
                    {copyLabel}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {hasExhaustedRetry && (
              <View style={{
                backgroundColor: '#FFF2F2',
                borderRadius: 10,
                padding: 12,
                marginTop: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}>
                <Text style={{ fontSize: 13, color: '#FF3B30', fontFamily: 'Inter_400Regular', flex: 1 }}>
                  Could not load payment details. Tap Refresh to try again.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    autoRefreshAttemptedRef.current = false;
                    setLoadingIntent(true);
                    fetchPaymentIntent();
                  }}
                  style={{ backgroundColor: '#FF3B30', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
                >
                  <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' }}>Refresh</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ height: 1, backgroundColor: '#F2F2F7', marginBottom: 16 }} />

            {/* Account Name Row */}
            <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold', marginBottom: 6 }}>
              ACCOUNT NAME
            </Text>
            <Text style={{ fontSize: 17, fontFamily: 'Inter_600SemiBold', color: loadingIntent ? '#8E8E93' : '#000000' }}>
              {loadingIntent ? 'Generating...' : (paymentIntent?.monnify_account_name ?? 'FlashLocum')}
            </Text>
          </View>

          {/* Countdown Card — hidden for manual FlashLocum route */}
          {!isManualRoute && (
            <View style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 20,
              marginBottom: 28,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 8,
              elevation: 2,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold', marginBottom: 6 }}>
                  ACCOUNT DETAILS HELD FOR
                </Text>
                <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', lineHeight: 18 }}>
                  Account details may change if payment isn't made in time.
                </Text>
              </View>
              <Text style={{ fontSize: 28, fontFamily: 'Inter_700Bold', color: countdownColor, letterSpacing: 0.5 }}>
                {countdownDisplay}
              </Text>
            </View>
          )}

          {/* Footer Note */}
          {!isManualRoute && (
            <Text style={{
              fontSize: 13,
              color: '#8E8E93',
              fontFamily: 'Inter_400Regular',
              lineHeight: 20,
              textAlign: 'center',
              marginBottom: 24,
            }}>
              Send the exact amount above from any Nigerian bank app. This page updates automatically once payment is received.
            </Text>
          )}

          {/* Manual route — I Have Made Payment / Payment Awaiting Confirmation */}
          {isManualRoute && (
            claimed ? (
              <View style={{
                backgroundColor: '#F0FDF4',
                borderRadius: 16,
                padding: 20,
                marginBottom: 28,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#BBF7D0',
              }}>
                <Text style={{ fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#15803D', marginBottom: 6 }}>
                  Payment Awaiting Confirmation
                </Text>
                <Text style={{ fontSize: 14, color: '#166534', fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 }}>
                  We have received your transfer notification and will confirm your payment shortly.
                </Text>
              </View>
            ) : (
              <>
                <View style={{
                  backgroundColor: '#F5F5F5',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                }}>
                  <Text style={{
                    fontSize: 14,
                    fontFamily: 'Inter_400Regular',
                    color: '#555555',
                    lineHeight: 20,
                    textAlign: 'center',
                  }}>
                    Once you've completed the transfer, tap the button below so we can confirm your payment and complete your coverage.
                  </Text>
                </View>
                <TouchableOpacity
                onPress={handleClaimPayment}
                disabled={claiming}
                activeOpacity={0.8}
                style={{
                  backgroundColor: claiming ? '#A3A3A3' : '#000000',
                  borderRadius: 14,
                  paddingVertical: 18,
                  alignItems: 'center',
                  marginBottom: 28,
                }}
              >
                {claiming ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>
                    I Have Made Payment
                  </Text>
                )}
              </TouchableOpacity>
              </>
            )
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── RequesterRatingCard ──────────────────────────────────────────────────────

interface RequesterRatingCardProps {
  visible: boolean;
  session: CoverageSession | null;
  amount: number;
  ratingStars: number;
  ratingComment: string;
  ratingError: string;
  submittingRating: boolean;
  onDismiss: () => void;
  onStarPress: (star: number) => void;
  onCommentChange: (text: string) => void;
  onSubmitRating: () => void;
}

function RequesterRatingCard({
  visible,
  session,
  amount,
  ratingStars,
  ratingComment,
  ratingError,
  submittingRating,
  onDismiss,
  onStarPress,
  onCommentChange,
  onSubmitRating,
}: RequesterRatingCardProps) {
  if (!visible || !session) return null;

  const rawName = session.doctor_name ?? '';
  const doctorName = rawName
    ? (rawName.toLowerCase().startsWith('dr') ? rawName : `Dr. ${rawName}`)
    : 'the doctor';
  const displayAmount = amount > 0 ? amount : ((session as any).booked_price ?? session.price ?? 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      {/* Backdrop */}
      <Pressable
        style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={() => { console.log('[Requester] Rating backdrop pressed — dismissing'); Keyboard.dismiss(); onDismiss(); }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        pointerEvents="box-none"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}
          keyboardShouldPersistTaps="handled"
          pointerEvents="box-none"
        >
          {/* Card — tap inside dismisses keyboard only */}
          <Pressable
            onPress={() => Keyboard.dismiss()}
            style={{ backgroundColor: '#2C2C2E', borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 }}
          >
            {/* Payment confirmation banner */}
            <View style={{ backgroundColor: '#1A3A2A', borderRadius: 12, padding: 14, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759', marginRight: 8 }} />
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#34C759', letterSpacing: 0.5 }}>PAYMENT CONFIRMED</Text>
              </View>
              <Text style={{ fontSize: 28, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 2 }}>
                {'₦'}{Number(displayAmount).toLocaleString()}
              </Text>
              <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>
                Payment has been received successfully.
              </Text>
            </View>

            {/* Rating prompt */}
            <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 4 }}>
              {`How was your shift with ${doctorName}?`}
            </Text>
            <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 20 }}>
              Share your feedback and help us improve.
            </Text>

            {/* Stars */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => { console.log('[Requester] Rating star pressed', { star: n }); onStarPress(n); }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 36, color: n <= ratingStars ? '#F4A261' : '#48484A' }}>★</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Comment */}
            <TextInput
              value={ratingComment}
              onChangeText={onCommentChange}
              placeholder="Write a comment (optional)..."
              placeholderTextColor="#636366"
              multiline
              style={{
                backgroundColor: '#1C1C1E',
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: '#FFFFFF',
                minHeight: 80,
                textAlignVertical: 'top',
                marginBottom: 12,
              }}
            />

            {!!ratingError && (
              <Text style={{ fontSize: 13, color: '#EF4444', marginBottom: 8 }}>{ratingError}</Text>
            )}

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={onDismiss}
                activeOpacity={0.8}
                style={{ flex: 1, backgroundColor: '#3A3A3C', borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSubmitRating}
                disabled={submittingRating}
                activeOpacity={0.85}
                style={{ flex: 2, backgroundColor: submittingRating ? '#636366' : '#FFFFFF', borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }}>
                  {submittingRating ? 'Submitting...' : 'Submit Rating'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely merges an incoming partial session payload (from a broadcast or HTTP response)
 * into the existing React state. Frontend-only properties that are not present in the
 * incoming payload are always preserved from `prev`.
 *
 * This prevents broadcast handlers from silently deleting UI-only state such as
 * `_initialPayment` when they spread a plain database row over the full state object.
 */
function mergeSession(
  prev: CoverageSession,
  incoming: Partial<CoverageSession> | undefined | null
): CoverageSession {
  if (!incoming) return prev;
  const merged: any = {
    ...prev,
    ...incoming,
    // Preserve frontend-only fields that are never present in DB/broadcast payloads.
    // Add new frontend-only fields here as the app grows.
    _initialPayment: (prev as any)._initialPayment,
  };
  return merged as CoverageSession;
}

export default function RequesterHomeScreen() {
  const insets = useSafeAreaInsets();
  const { setTabBarVisible } = useTabBarVisibility();
  const { user, profile } = useAuth();
  const { playAcceptanceChime, clearChimeForSession } = useNotifications();
  const recentPlaceKey = user?.id ? `flashlocum_recent_place_${user.id}` : null;
  const accountStatus = profile?.verification_status ?? 'verified'; // default verified for requesters until explicitly set
  const isAccountBlocked = accountStatus === 'under_review' || accountStatus === 'suspended';
  const isUnderReview = accountStatus === 'under_review';
  const isSuspended = accountStatus === 'suspended';

  // Live requester scores — seeded from cache to avoid flicker
  const _cachedRScores = getCached<{ rating: number; reliability: number }>('requester_scores');
  const [requesterRating, setRequesterRating] = useState<number | null>(_cachedRScores?.rating ?? null);
  const [requesterReliability, setRequesterReliability] = useState<number | null>(_cachedRScores?.reliability ?? null);
  const [tooltipVisible, setTooltipVisible] = useState<'rating' | 'reliability' | null>(null);

  // ─── Fetch requester scores on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('requester_profiles')
          .select('rating, reliability')
          .eq('id', user.id)
          .single();
        if (!isMountedRef.current) return;
        if (error) {
          return;
        }
        if (data) {
          setRequesterRating(data.rating ?? null);
          setRequesterReliability(data.reliability ?? null);
          setCached('requester_scores', { rating: data.rating ?? 5.0, reliability: data.reliability ?? 100 });
        }
      } catch (e: any) {
      }
    })();
  }, [user]);

  // ─── Realtime: merged requester-user channel (scores + payment + cancellation) ─
  // Consolidates former channels: requester-scores, requester-home-user, requester
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const chRef = { current: null as ReturnType<typeof supabase.channel> | null };
    (async () => {
      const name = `requester-user:${user.id}`;
      const existing = supabase.getChannels().find(c => c.topic === `realtime:${name}`);
      if (existing) await supabase.removeChannel(existing);
      if (cancelled) return;
      const ch = supabase.channel(name)
        // From channel 3 (scores)
        .on('broadcast', { event: 'RATING_UPDATED' }, (payload) => {
          if (!isMountedRef.current) return;
          if (payload?.payload?.reviewer_role === 'doctor') {
            const newRating = payload?.payload?.new_rating;
            if (newRating !== undefined) {
              setRequesterRating(newRating);
              const prev = getCached<{ rating: number; reliability: number }>('requester_scores');
              setCached('requester_scores', { rating: newRating, reliability: prev?.reliability ?? 100 });
            }
          }
        })
        .on('broadcast', { event: 'RELIABILITY_UPDATED' }, (payload) => {
          if (!isMountedRef.current) return;
          const newReliability = payload?.payload?.new_reliability;
          if (newReliability !== undefined) {
            setRequesterReliability(newReliability);
            const prev = getCached<{ rating: number; reliability: number }>('requester_scores');
            setCached('requester_scores', { rating: prev?.rating ?? 5.0, reliability: newReliability });
          }
        })
        // From channel 6 (payment confirmed on user channel)
        .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
          if (!isMountedRef.current) return;
          console.log('[Requester] user channel payment_confirmed received', payload?.payload);
          const sessionId = payload?.payload?.session_id;
          invalidate(`requester-coverage-${user?.id ?? 'anon'}`);
          handlePaymentConfirmedWithFallbackRef.current(sessionId, payload?.payload?.paid_at);
          startRequesterPaymentPollingRef.current();
        })
        .on('broadcast', { event: 'PAYMENT_CONFIRMED' }, (payload) => {
          if (!isMountedRef.current) return;
          console.log('[Requester] user channel PAYMENT_CONFIRMED received', payload?.payload);
          const sessionId = payload?.payload?.session_id;
          invalidate(`requester-coverage-${user?.id ?? 'anon'}`);
          handlePaymentConfirmedWithFallbackRef.current(sessionId, payload?.payload?.paid_at);
          startRequesterPaymentPollingRef.current();
        })
        // From channel 7 (shift cancelled on requester channel)
        .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
          if (!isMountedRef.current) return;
          console.log('[Requester] requester-user channel SHIFT_CANCELLED received');
          PollingManager.stop('cancel');
          if (activeSessionRef.current?.id) clearChimeForSession(activeSessionRef.current.id);
          setActiveSession(null);
          PollingManager.start('cancel-confirm', async () => {
            const sid = activeSessionRef.current?.id ?? '';
            if (!sid) return true;
            const { data: s } = await supabase
              .from('coverage_sessions')
              .select('status')
              .eq('id', sid)
              .maybeSingle();
            if (!s || s.status === 'cancelled') {
              return true;
            }
            return false;
          }, undefined, 6);
        })
        .on('broadcast', { event: 'SESSION_CREATED' }, async (payload) => {
          if (!isMountedRef.current) return;
          // A session was created — confirm it before stopping recovery
          const sid = (payload?.payload as { session_id?: string } | undefined)?.session_id;
          if (sid && AppState.currentState === 'active') {
            playAcceptanceChime(sid);
          }
          // Fetch first — only stop recovery mechanisms once session is positively confirmed
          const session = await fetchActiveSessionRef.current();
          if (!isMountedRef.current) return;
          if (session && session.request_id === activeRequestIdRef.current) {
            // Session confirmed and matches the active request — safe to stop all recovery
            PollingManager.stop('match');
            if (shouldPollRef.current) {
              shouldPollRef.current = false;
              if (pollIntervalRef.current) {
                clearTimeout(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            }
            if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
            transitionToRef.current('idle');
          }
          // If session is null: leave all recovery running — doPoll and MATCH_CONFIRMED will catch it
        })
        .subscribe((status) => {
        });
      chRef.current = ch;
    })();
    return () => {
      cancelled = true;
      if (chRef.current) { supabase.removeChannel(chRef.current); chRef.current = null; }
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Realtime: requester:{user.id} channel — catches doctor-initiated cancellations ─
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const chRef = { current: null as ReturnType<typeof supabase.channel> | null };
    (async () => {
      const name = `requester:${user.id}`;
      const existing = supabase.getChannels().find(c => c.topic === `realtime:${name}`);
      if (existing) await supabase.removeChannel(existing);
      if (cancelled) return;
      const ch = supabase.channel(name)
        .on('broadcast', { event: 'SHIFT_CANCELLED' }, () => {
          if (!isMountedRef.current) return;
          console.log('[Requester] requester channel SHIFT_CANCELLED received — doctor cancelled');
          PollingManager.stop('cancel');
          if (activeSessionRef.current?.id) clearChimeForSession(activeSessionRef.current.id);
          setActiveSession(null);
          PollingManager.start('cancel-confirm', async () => {
            const sid = activeSessionRef.current?.id ?? '';
            if (!sid) return true;
            const { data: s } = await supabase
              .from('coverage_sessions')
              .select('status')
              .eq('id', sid)
              .maybeSingle();
            if (!s || s.status === 'cancelled') {
              return true;
            }
            return false;
          }, undefined, 6);
        })
        .subscribe();
      chRef.current = ch;
    })();
    return () => {
      cancelled = true;
      if (chRef.current) { supabase.removeChannel(chRef.current); chRef.current = null; }
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const requesterProfilePgRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sessionStatusWatchReqRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── postgres_changes — requester_profiles: Layer 3 for Ratings ───────────
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const name = `requester-profile-pg:${user.id}`;
      if (requesterProfilePgRef.current) {
        await supabase.removeChannel(requesterProfilePgRef.current);
        requesterProfilePgRef.current = null;
      }
      if (cancelled) return;
      const ch = supabase.channel(name)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'requester_profiles',
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            if (!isMountedRef.current) return;
            const row = payload.new as any;
            console.log('[Requester] requester_profiles UPDATE via postgres_changes — rating:', row.rating, 'reliability:', row.reliability);
            if (row.rating !== undefined && row.rating !== null) {
              setRequesterRating(Number(row.rating));
            }
            if (row.reliability !== undefined && row.reliability !== null) {
              setRequesterReliability(Number(row.reliability));
            }
          }
        )
        .subscribe((status) => {
          console.log('[Requester] requester-profile-pg channel:', status);
        });
      requesterProfilePgRef.current = ch;
    })();
    return () => {
      cancelled = true;
      if (requesterProfilePgRef.current) { supabase.removeChannel(requesterProfilePgRef.current); requesterProfilePgRef.current = null; }
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapRef = useRef<MapView>(null);
  const [mapRegion, setMapRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }>(_cachedRequesterRegion ?? LAGOS_REGION);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(
    _cachedRequesterCoords
  );
  const [userMarkerTracksViews, setUserMarkerTracksViews] = useState(true);
  // ─── tracksViewChanges fix for doctor markers on Android ────────────────────
  const [doctorMarkerTracksViews, setDoctorMarkerTracksViews] = useState(true);
  useEffect(() => {
    // On Android keep tracksViewChanges=true permanently (eliminates the native
    // snapshot race that causes blank icons). On iOS freeze after 1500ms.
    if (Platform.OS === 'ios') {
      const t = setTimeout(() => setDoctorMarkerTracksViews(false), 1500);
      return () => clearTimeout(t);
    }
    // Android: leave doctorMarkerTracksViews=true permanently
    return undefined;
  }, []); // runs once on mount
  const [onlineDoctors, setOnlineDoctors] = useState<{ id: string; lat: number; lng: number }[]>([]);

  const locationSub = useRef<Location.LocationSubscription | null>(null);

  const doctorPoints = useMemo(() => {
    return onlineDoctors.map((doc) => ({
      type: 'Feature' as const,
      properties: { cluster: false, doctorId: doc.id },
      geometry: {
        type: 'Point' as const,
        coordinates: [doc.lng, doc.lat],
      },
    }));
  }, [onlineDoctors]);

  const bounds = useMemo((): [number, number, number, number] => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
    return [
      longitude - longitudeDelta / 2,   // west
      latitude - latitudeDelta / 2,     // south
      longitude + longitudeDelta / 2,   // east
      latitude + latitudeDelta / 2,     // north
    ];
  }, [mapRegion]);

  const zoom = useMemo(() => {
    return Math.min(
      Math.round(Math.log(360 / mapRegion.longitudeDelta) / Math.LN2),
      20
    );
  }, [mapRegion]);

  const { clusters, supercluster } = useSupercluster({
    points: doctorPoints,
    bounds,
    zoom,
    options: { radius: 60, maxZoom: 17 },
  });

  const fetchOnlineDoctors = useCallback(async () => {
    const { data, error } = await supabase
      .from('doctor_profiles')
      .select('id, lat, lng')
      .eq('is_online', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null);
    if (!isMountedRef.current) return;
    if (error) {
      return;
    }
    setOnlineDoctors((data ?? []) as { id: string; lat: number; lng: number }[]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Online doctors realtime (Broadcast — bypasses RLS) ──
  const wasSubscribed = useRef(false);

  useEffect(() => {
    if (!user) return;

    console.log('[OnlineDoctors] Subscribing to doctor-status broadcast channel');
    fetchOnlineDoctors();

    const ch = supabase
      .channel('doctor-status')
      .on('broadcast', { event: 'doctor_status_changed' }, (msg) => {
        const raw = (msg.payload as any);
        console.log('[doctor_status_changed] raw payload received:', JSON.stringify(raw));
        const data = (raw?.id != null ? raw : raw?.payload) as { id?: string; lat?: number; lng?: number; is_online?: boolean } | null;
        console.log('[OnlineDoctors] Received doctor_status_changed broadcast', data);
        if (!data?.id) return;
        if (data.is_online && data.lat != null && data.lng != null) {
          setOnlineDoctors((prev) => {
            const filtered = prev.filter((d) => d.id !== data.id);
            return [...filtered, { id: data.id!, lat: data.lat!, lng: data.lng! }];
          });
        } else {
          setOnlineDoctors((prev) => prev.filter((d) => d.id !== data.id));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (!isMountedRef.current) return;
          // Always re-fetch on every SUBSCRIBED confirmation — closes the race window
          // between the initial DB fetch and the moment the WebSocket is actually live.
          // Any doctor who went online in that gap will be picked up here.
          console.log('[OnlineDoctors] Broadcast channel SUBSCRIBED, re-fetching online doctors');
          fetchOnlineDoctors();
          wasSubscribed.current = true;
        }
      });

    return () => {
      console.log('[OnlineDoctors] Unsubscribing from doctor-status broadcast channel');
      supabase.removeChannel(ch);
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Online doctors Postgres Changes fallback (independent delivery path) ──
  useEffect(() => {
    if (!user) return;

    console.log('[OnlineDoctors] Subscribing to doctor-profiles-presence Postgres Changes channel');

    const pgCh = supabase
      .channel('doctor-profiles-presence')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'doctor_profiles' },
        (payload) => {
          const row = payload.new as { id?: string; lat?: number | null; lng?: number | null; is_online?: boolean };
          console.log('[OnlineDoctors] Postgres Changes UPDATE received', row);
          if (!row?.id) return;
          if (row.is_online === true && row.lat != null && row.lng != null) {
            setOnlineDoctors((prev) => {
              const filtered = prev.filter((d) => d.id !== row.id);
              return [...filtered, { id: row.id!, lat: row.lat!, lng: row.lng! }];
            });
          } else {
            setOnlineDoctors((prev) => prev.filter((d) => d.id !== row.id));
          }
        }
      )
      .subscribe((status) => {
        console.log('[OnlineDoctors] Postgres Changes channel status:', status);
        if (status === 'SUBSCRIBED') {
          if (!isMountedRef.current) return;
          console.log('[OnlineDoctors] Postgres Changes channel SUBSCRIBED, re-fetching online doctors');
          fetchOnlineDoctors();
        }
      });

    return () => {
      console.log('[OnlineDoctors] Unsubscribing from doctor-profiles-presence Postgres Changes channel');
      supabase.removeChannel(pgCh);
    };
  }, [user, fetchOnlineDoctors]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sheet state
  const [sheetState, setSheetState] = useState<SheetState>('idle');
  const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHTS.idle)).current;

  // Place
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

  // Recent place
  const [recentPlace, setRecentPlace] = useState<SelectedPlace | null>(null);

  // Search (Places API New)
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<{
    placeId: string;
    mainText: string;
    secondaryText: string;
  }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Config form
  const [coverageType, setCoverageType] = useState<'Standard' | 'Home Care'>('Standard');
  const [watNow, setWatNow] = useState<Date>(new Date(Date.now() + 60 * 60 * 1000));
  const [shiftDate, setShiftDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [endTime, setEndTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    return d;
  });
  const [coverageLength, setCoverageLength] = useState(1);
  const [environment, setEnvironment] = useState<'Normal' | 'Busy'>('Normal');
  const [note, setNote] = useState('');

  // Live price preview state
  const [previewPrice, setPreviewPrice] = useState<number>(0);
  const [previewHours, setPreviewHours] = useState<number>(0);
  const [previewLabel, setPreviewLabel] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewPriceError, setPreviewPriceError] = useState<boolean>(false);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  // Date/time pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // Matching progress
  const matchProgressAnim = useRef(new Animated.Value(0.05)).current;
  const [submitting, setSubmitting] = useState(false);
  const [continueProcessing, setContinueProcessing] = useState(false);
  const [startShiftProcessing, setStartShiftProcessing] = useState(false);
  const [resumeShiftProcessing, setResumeShiftProcessing] = useState(false);
  const [pauseShiftProcessing, setPauseShiftProcessing] = useState(false);
  const [endShiftProcessing, setEndShiftProcessing] = useState(false);
  const [cancelShiftProcessing, setCancelShiftProcessing] = useState(false);

  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  // Active session state
  const [activeSession, setActiveSession] = useState<CoverageSession | null>(
    _sessionCachePopulated ? _cachedActiveSession : null
  );
  const activeSessionRef = useRef<CoverageSession | null>(null);
  const isFirstLoadRef = useRef(true);
  const [sessionLoading, setSessionLoading] = useState(false); // kept for any remaining uses but never set true again after first load
  const [sessionFetched, setSessionFetched] = useState(_sessionCachePopulated);
  const [mapReady, setMapReady] = useState(false);
  // Stable session ID — only set when a real ID arrives, never cleared when session becomes null.
  // This prevents the session channel from re-subscribing to 'session:undefined' after payment_confirmed.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Keep activeSessionRef in sync with activeSession state
  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);

  // Post-payment success state
  const [confirmedSession, setConfirmedSession] = useState<CoverageSession | null>(null);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState('');
  const sessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);



  // Realtime refs for matching
  const matchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldPollRef = useRef(false);
  const activeRequestIdRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const fetchActiveSessionRef = useRef<() => Promise<CoverageSession | null>>(async () => null);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const transitionToRef = useRef<(state: SheetState) => void>(() => {});
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const playAcceptanceChimeRef = useRef<(sessionId: string) => Promise<void>>(async (_sessionId: string) => {});
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const handlePaymentConfirmedWithFallbackRef = useRef<(sessionId?: string, paymentConfirmedAt?: string) => void>(() => {});
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const startRequesterPaymentPollingRef = useRef<() => void>(() => {});
  const isMountedRef = useRef(true);



  // ─── Load recent place on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!recentPlaceKey) return;
    console.log('[RequesterHome] Loading recent place for user', user?.id);
    SecureStore.getItemAsync(recentPlaceKey).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as SelectedPlace;
          setRecentPlace(parsed);
        } catch {
        }
      }
    });
  }, [recentPlaceKey, user?.id]);

  // ─── Fetch active session helper ──────────────────────────────────────────────
  const fetchActiveSession = useCallback(async (): Promise<CoverageSession | null> => {
    try {
      const res = await fetchWithAuth(`${EDGE_BASE}/get-active-session?role=requester`, {});
      if (!isMountedRef.current) return null;
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return null;
      }
      const data = await res.json();
      if (!isMountedRef.current) return null;
      const session: CoverageSession | null = data?.session ?? null;
      setActiveSession(session);
      if (session) {
        setActiveSessionId(session.id);
      }
      _cachedActiveSession = session;
      _sessionCachePopulated = true;
      // If session is already paid, use persistent guard to decide whether to show modal
      if (session && session.status === 'requester_paid') {
        // Synchronous check first — avoids async gap
        if (_requesterPaidSessions.has(session.id) || _requesterRatingInFlight.has(session.id) || _requesterDismissedSessions.has(session.id)) {
        } else {
          _requesterRatingInFlight.add(session.id);
          // Check AsyncStorage first
          const alreadyHandled = await isRequesterSessionPaid(session.id);
          if (!isMountedRef.current) return null;
          if (alreadyHandled) {
            _requesterRatingInFlight.delete(session.id);
          } else {
            // Check DB — ultimate source of truth (review + dismissal)
            try {
              const [existingReview, existingDismissal] = await Promise.all([
                supabase.from('shift_reviews').select('id').eq('session_id', session.id).eq('reviewer_role', 'requester').maybeSingle(),
                supabase.from('rating_dismissals').select('id').eq('session_id', session.id).eq('user_id', user?.id ?? '').eq('reviewer_role', 'requester').maybeSingle(),
              ]);
              if (!isMountedRef.current) return null;
              if (existingReview.data || existingDismissal.data) {
                markRequesterSessionPaid(session.id);
                _requesterRatingInFlight.delete(session.id);
              } else {
                _requesterRatingInFlight.delete(session.id);
                setConfirmedSession((prev) => {
                  if (!prev) {
                    setShowPaymentSuccess(true);
                    return session;
                  }
                  return prev;
                });
              }
            } catch {
              // Non-fatal — fall through to show modal
              _requesterRatingInFlight.delete(session.id);
              setConfirmedSession((prev) => {
                if (!prev) {
                  setShowPaymentSuccess(true);
                  return session;
                }
                return prev;
              });
            }
          }
        }
      }
      return session;
    } catch (e: any) {
      return null;
    } finally {
      if (isMountedRef.current) {
        isFirstLoadRef.current = false;
        setSessionFetched(true); // mark that at least one fetch has completed
        setSessionLoading(false);
      }
    }
  }, [user?.id]);

  // Note: activeSessionId is set directly in fetchActiveSession() alongside setActiveSession()
  // to ensure both state values update in the same render cycle. The separate sync useEffect
  // has been removed — the two-hop update is now collapsed into fetchActiveSession.



  // ─── On mount — restore session state ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await warmRequesterPaidCache();
      fetchActiveSession();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Notification tap: REQUEST_EXPIRED → restore expired request into config form ──
  useEffect(() => {
    (async () => {
      let pendingId: string | null = null;
      try {
        pendingId = await AsyncStorage.getItem('@flashlocum:pending_modify_request_id');
        if (!pendingId) return;

        console.log('[RequesterHome] Restoring expired request from notification tap:', pendingId);

        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) return; // not authenticated — leave key for next mount

        const { data: req } = await supabase
          .from('coverage_requests')
          .select('hospital_name, hospital_address, latitude, longitude, shift_type, shift_date, start_time, end_time, coverage_length, environment, note, requester_id')
          .eq('id', pendingId)
          .eq('requester_id', userId)
          .maybeSingle();

        if (!req) {
          // Not found or not owned by this user — discard
          await AsyncStorage.removeItem('@flashlocum:pending_modify_request_id');
          return;
        }

        if (!isMountedRef.current) return;

        // Repopulate form — exact field mapping from handleRequestCoverage submit body
        setSelectedPlace({
          name: req.hospital_name,
          address: req.hospital_address,
          lat: req.latitude,
          lng: req.longitude,
        });
        setCoverageType((req.shift_type as 'Standard' | 'Home Care') ?? 'Standard');
        if (req.shift_date) setShiftDate(new Date(req.shift_date));
        if (req.start_time && typeof req.start_time === 'string' && /^\d{1,2}:\d{2}/.test(req.start_time)) {
          const [h, m] = req.start_time.split(':').map(Number);
          if (!isNaN(h) && !isNaN(m)) {
            const d = new Date(); d.setHours(h, m, 0, 0); setStartTime(d);
          } else {
            console.warn('[RequesterHome] Malformed start_time value, skipping:', req.start_time);
          }
        } else if (req.start_time) {
          console.warn('[RequesterHome] Invalid start_time format, skipping:', req.start_time);
        }
        if (req.end_time && typeof req.end_time === 'string' && /^\d{1,2}:\d{2}/.test(req.end_time)) {
          const [h, m] = req.end_time.split(':').map(Number);
          if (!isNaN(h) && !isNaN(m)) {
            const d = new Date(); d.setHours(h, m, 0, 0); setEndTime(d);
          } else {
            console.warn('[RequesterHome] Malformed end_time value, skipping:', req.end_time);
          }
        } else if (req.end_time) {
          console.warn('[RequesterHome] Invalid end_time format, skipping:', req.end_time);
        }
        if (req.coverage_length != null) setCoverageLength(req.coverage_length);
        if (req.environment) setEnvironment(req.environment as 'Normal' | 'Busy');
        setNote(req.note ?? '');

        // Remove key only after successful restore
        await AsyncStorage.removeItem('@flashlocum:pending_modify_request_id');

        transitionTo('config');
      } catch (e) {
        console.warn('[RequesterHome] Failed to restore expired request from notification tap:', e);
        // Leave key in place — next mount will retry
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cleanup PollingManager on unmount ───────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;  // gate first
      PollingManager.stopAll();
      _requesterRatingInFlight.clear();
    };
  }, []);

  // ─── Re-fetch on SIGNED_IN (handles login after logout) ──────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        console.log('[RequesterHome] SIGNED_IN — re-fetching active session');
        warmRequesterPaidCache().then(() => fetchActiveSession());
      } else if (event === 'SIGNED_OUT') {
        console.log('[RequesterHome] SIGNED_OUT — clearing activeSessionId and session cache');
        setActiveSessionId(null);
        setActiveSession(null);
        setSessionFetched(false);
        _cachedActiveSession = null;
        _sessionCachePopulated = false;
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchActiveSession]);

  // ─── AppState reconnection safety net ────────────────────────────────────────
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // Read ref BEFORE fetchActiveSession — fetchActiveSession may overwrite it to null
        const snapBefore = activeSessionRef.current;
        fetchOnlineDoctors();
        await fetchActiveSession();
        // Check the pre-fetch snap first (covers the case where session was paid before fetch)
        const snapAfter = activeSessionRef.current;
        const snap = snapAfter ?? snapBefore;
        if (snap && snap.status === 'requester_paid') {
          if (!_requesterPaidSessions.has(snap.id) && !_requesterDismissedSessions.has(snap.id)) {
            console.log('[Requester] AppState active — session in paid state:', snap.status, '— showing overlay');
            setConfirmedSession(snap);
            setShowPaymentSuccess(true);
          }
        }
        // Rating recovery — re-fetch own scores in case RATING_UPDATED broadcast was missed
        if (user?.id) {
          try {
            const { data: profileSnap } = await supabase
              .from('requester_profiles')
              .select('rating, reliability')
              .eq('id', user.id)
              .single();
            if (profileSnap) {
              if (profileSnap.rating !== null && profileSnap.rating !== undefined) setRequesterRating(Number(profileSnap.rating));
              if (profileSnap.reliability !== null && profileSnap.reliability !== undefined) setRequesterReliability(Number(profileSnap.reliability));
            }
          } catch { /* non-fatal */ }
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [fetchActiveSession, fetchOnlineDoctors, user?.id]);

  // ─── Proactive payment poll — starts whenever session enters payment_pending state ───
  // Ensures overlay fires even if PAYMENT_CONFIRMED broadcast was missed
  useEffect(() => {
    if (activeSession?.status !== 'payment_pending') return;
    console.log('[Requester] session entered payment_pending — starting payment poll proactively');
    startRequesterPaymentPollingRef.current();
  }, [activeSession?.status, activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Session realtime subscription ───────────────────────────────────────────
  useEffect(() => {
    if (!activeSessionId) {
      if (sessionChannelRef.current) {
        supabase.removeChannel(sessionChannelRef.current);
        sessionChannelRef.current = null;
      }
      return;
    }

    const channelName = `session:${activeSessionId}`;

    if (sessionChannelRef.current) {
      supabase.removeChannel(sessionChannelRef.current);
      sessionChannelRef.current = null;
    }

    const ch = supabase.channel(channelName)
      .on('broadcast', { event: 'SHIFT_STARTED' }, async (payload) => {
        if (!isMountedRef.current) return;
        console.log('[Requester] broadcast SHIFT_STARTED received');
        const updated = payload?.payload?.session as Partial<CoverageSession> | undefined;
        if (updated) setActiveSession((prev) => prev ? mergeSession(prev, updated) : prev);
        await fetchActiveSessionRef.current();
        if (!isMountedRef.current) return;
        PollingManager.stop('start-shift');
      })
      .on('broadcast', { event: 'SHIFT_PAUSED' }, async (payload) => {
        if (!isMountedRef.current) return;
        console.log('[Requester] broadcast SHIFT_PAUSED received');
        const updated = payload?.payload?.session as Partial<CoverageSession> | undefined;
        if (updated) setActiveSession((prev) => prev ? mergeSession(prev, updated) : prev);
        await fetchActiveSessionRef.current();
        if (!isMountedRef.current) return;
        PollingManager.stop('pause-shift');
      })
      .on('broadcast', { event: 'SHIFT_RESUMED' }, async (payload) => {
        if (!isMountedRef.current) return;
        console.log('[Requester] broadcast SHIFT_RESUMED received');
        const updated = payload?.payload?.session as Partial<CoverageSession> | undefined;
        if (updated) setActiveSession((prev) => prev ? mergeSession(prev, updated) : prev);
        await fetchActiveSessionRef.current();
        if (!isMountedRef.current) return;
        PollingManager.stop('resume-shift');
      })
      .on('broadcast', { event: 'SHIFT_ENDED' }, (payload) => {
        PollingManager.stop('end-shift');
        console.log('[Requester] broadcast SHIFT_ENDED received');
        const updated = payload?.payload?.session as Partial<CoverageSession>;
        setActiveSession((prev) => prev ? mergeSession(prev, updated) : prev);
        // Start polling immediately — catches PAYMENT_CONFIRMED if broadcast is missed
        startRequesterPaymentPollingRef.current();
      })
      .on('broadcast', { event: 'PAYMENT_DEADLINE_EXTENDED' }, (payload) => {
        const newDeadline = payload?.payload?.payment_deadline_at as string;
        const lateFee = payload?.payload?.late_fee as number;
        const newTotal = payload?.payload?.new_total as number;
        if (newDeadline) {
          setActiveSession((prev) => prev ? {
            ...prev,
            payment_deadline_at: newDeadline,
            price: newTotal ?? prev.price,
            monnify_account_number: payload?.payload?.account_number ?? prev.monnify_account_number,
            monnify_bank_name: payload?.payload?.bank_name ?? prev.monnify_bank_name,
            monnify_account_name: payload?.payload?.account_name ?? prev.monnify_account_name,
          } : prev);
        }
        if (lateFee) {
          Alert.alert(
            'Payment Session Expired',
            `A late fee of ₦${lateFee.toLocaleString()} has been applied. New total: ₦${newTotal.toLocaleString()}.`,
            [{ text: 'OK' }]
          );
        }
      })
      .on('broadcast', { event: 'PAYMENT_CONFIRMED' }, (payload) => {
        if (!isMountedRef.current) return;
        console.log('[Requester] session channel PAYMENT_CONFIRMED received', payload?.payload);
        const sessionId = payload?.payload?.session_id;
        handlePaymentConfirmedWithFallbackRef.current(sessionId, payload?.payload?.paid_at);
        startRequesterPaymentPollingRef.current();
      })
      .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
        if (!isMountedRef.current) return;
        console.log('[Requester] session channel payment_confirmed received', payload?.payload);
        const sessionId = payload?.payload?.session_id;
        handlePaymentConfirmedWithFallbackRef.current(sessionId, payload?.payload?.paid_at);
        startRequesterPaymentPollingRef.current();
      })
      .on('broadcast', { event: 'PAYMENT_COMPLETE' }, (payload) => {
        if (!isMountedRef.current) return;
        setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
      })
      .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
        if (!isMountedRef.current) return;
        PollingManager.stop('cancel');
        setActiveSession(null);
        PollingManager.start('cancel-confirm', async () => {
          const sid = activeSessionRef.current?.id ?? '';
          if (!sid) return true;
          const { data: s } = await supabase
            .from('coverage_sessions')
            .select('status')
            .eq('id', sid)
            .maybeSingle();
          if (!s || s.status === 'cancelled') {
            return true;
          }
          return false;
        }, undefined, 6);
      })
      .subscribe((status) => {
        console.log('[Requester] session channel subscribe status:', status, 'for session:', activeSessionId);
        if (status === 'SUBSCRIBED') {
          if (!isMountedRef.current) return;
          fetchActiveSessionRef.current();
        }
      });

    sessionChannelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      sessionChannelRef.current = null;
    };
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stable postgres_changes on coverage_sessions — layer 3 for session events ──
  // Mounted once on user.id. Replaces the unstable session-ID-scoped subscription.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const name = `session-status-watch-req:${user.id}`;
      if (sessionStatusWatchReqRef.current) {
        await supabase.removeChannel(sessionStatusWatchReqRef.current);
        sessionStatusWatchReqRef.current = null;
      }
      if (cancelled) return;
      const ch = supabase.channel(name)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'coverage_sessions',
            filter: `requester_id=eq.${user.id}`,
          },
          (payload) => {
            const newRow = payload.new as Partial<CoverageSession>;
            const status = newRow?.status;
            console.log('[Requester] coverage_sessions INSERT via postgres_changes — status:', status, 'id:', newRow.id);
            if (status === 'upcoming' || status === 'active' || status === 'paused' || status === 'payment_pending') {
              fetchActiveSessionRef.current();
            } else if (status === 'requester_paid' || status === 'settled') {
              handlePaymentConfirmedWithFallbackRef.current(newRow.id);
            } else if (status === 'cancelled') {
              setActiveSession(null);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'coverage_sessions',
            filter: `requester_id=eq.${user.id}`,
          },
          (payload) => {
            const newRow = payload.new as Partial<CoverageSession>;
            const status = newRow?.status;
            console.log('[Requester] coverage_sessions UPDATE via postgres_changes — status:', status, 'id:', newRow.id);
            if (status === 'upcoming' || status === 'active' || status === 'paused' || status === 'payment_pending') {
              fetchActiveSessionRef.current();
            } else if (status === 'requester_paid' || status === 'settled') {
              handlePaymentConfirmedWithFallbackRef.current(newRow.id);
            } else if (status === 'cancelled') {
              setActiveSession(null);
            }
          }
        )
        .subscribe((status) => {
          console.log('[Requester] session-status-watch-req channel:', status);
        });
      sessionStatusWatchReqRef.current = ch;
    })();
    return () => {
      cancelled = true;
      if (sessionStatusWatchReqRef.current) { supabase.removeChannel(sessionStatusWatchReqRef.current); sessionStatusWatchReqRef.current = null; }
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Channels 6 and 7 merged into requester-user channel above

  // ─── Location setup — started after PermissionsOverlay grants access ─────────
  // (silent on-mount request removed; location is obtained in handlePermissionsAllGranted)
  // Cleanup subscription on unmount
  useEffect(() => {
    return () => { locationSub.current?.remove(); };
  }, []);

  // ─── Silent location watch on mount if permission already granted ─────────────
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        if (locationSub.current) return; // already watching
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
          (loc) => {
            if (!isMountedRef.current) return;
            const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            _cachedRequesterCoords = coords;
            setUserCoords(coords);
          }
        );
        locationSub.current = sub;
      } catch (e) {
        console.log('[RequesterHome] Silent location watch failed:', e);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── GPS diagnostic watcher ───────────────────────────────────────────────────
  useEffect(() => {
  }, [userCoords]);

  // ─── tracksViewChanges: keep true permanently on both platforms ──────────────
  // Mirrors doctor home — no freeze, no AppState reset needed.
  useEffect(() => {
    if (!userCoords) return;
    setUserMarkerTracksViews(true);
    const t = setTimeout(() => setUserMarkerTracksViews(false), 500);
    return () => clearTimeout(t);
  }, [userCoords]);

  // ─── Re-focus map on tab return ──────────────────────────────────────────────
  useFocusEffect(
    React.useCallback(() => {
      const doAnimate = () => {
        if (_cachedRequesterCoords && mapRef.current) {
          const targetRegion = {
            latitude: _cachedRequesterCoords.latitude + MAP_LAT_OFFSET,
            longitude: _cachedRequesterCoords.longitude + MAP_LNG_OFFSET,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12,
          };
          try {
            console.log('[Map] animateToRegion on tab focus', targetRegion);
            mapRef.current.animateToRegion(targetRegion, 600);
          } catch {
            // map not ready
          }
        }
      };
      const t1 = setTimeout(doAnimate, 300);
      const t2 = setTimeout(doAnimate, 800);
      const t3 = setTimeout(doAnimate, 1500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }, [])
  );

  // ─── Signal splash screen ready — wait for initial session fetch to complete ─
  // sessionFetched is set in the finally{} block of fetchActiveSession, so it
  // becomes true whether the fetch succeeded or failed cleanly. This prevents
  // the splash from hiding on a blank screen, while also preventing an infinite
  // splash if the network request fails.
  // mapReady gates on onMapReady — with a 3s safety ceiling in case it never fires.
  const { signalScreenReady, splashDismissed } = useSplash();
  const splashSignalledRef = useRef(false);
  // Safety ceiling: if onMapReady never fires, signal ready after 3s of session being fetched.
  useEffect(() => {
    if (!sessionFetched) return;
    const timeout = setTimeout(() => {
      if (splashSignalledRef.current) return;
      splashSignalledRef.current = true;
      signalScreenReady();
    }, 3000);
    return () => clearTimeout(timeout);
  }, [sessionFetched, signalScreenReady]);
  useEffect(() => {
    if (splashSignalledRef.current) return;
    if (!sessionFetched || !mapReady) return;
    splashSignalledRef.current = true;
    signalScreenReady();
  }, [sessionFetched, mapReady, signalScreenReady]);

  // ── One-time notification permission request ──────────────────────────────
  useEffect(() => {
    if (!splashDismissed || !user?.id) return;
    if (IS_EXPO_GO) return;
    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status === 'granted') return;
        if (!canAskAgain) return;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const OneSignal = require('react-native-onesignal').OneSignal;
        await OneSignal.Notifications.requestPermission(true);
      } catch (e) {
        console.log('[RequesterHome] Notification permission request error:', e);
      }
    })();
  }, [splashDismissed, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Re-fetch online doctors on tab focus (after first mount) ────────────────
  const onlineDoctorsFocusRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!onlineDoctorsFocusRef.current) {
        onlineDoctorsFocusRef.current = true;
        return; // skip first focus — already fetched on mount via broadcast channel
      }
      console.log('[OnlineDoctors] Tab focused, re-fetching online doctors');
      fetchOnlineDoctors();
    }, [fetchOnlineDoctors])
  );

  // ─── Sheet height animation ───────────────────────────────────────────────────
  const animateSheet = useCallback((state: SheetState) => {
    Animated.timing(sheetAnim, {
      toValue: SHEET_HEIGHTS[state],
      duration: 320,
      useNativeDriver: false,
    }).start();
  }, [sheetAnim]);

  const transitionTo = useCallback((state: SheetState) => {
    setSheetState(state);
    animateSheet(state);
  }, [animateSheet]);

  // ─── Keep stable refs in sync with latest callbacks ──────────────────────────
  useEffect(() => { fetchActiveSessionRef.current = fetchActiveSession; }, [fetchActiveSession]);
  useEffect(() => { transitionToRef.current = transitionTo; }, [transitionTo]);
  useEffect(() => { activeRequestIdRef.current = activeRequestId; }, [activeRequestId]);
  useEffect(() => { playAcceptanceChimeRef.current = playAcceptanceChime; }, [playAcceptanceChime]);

  // ─── Clean up search state when leaving searching ─────────────────────────────
  useEffect(() => {
    if (sheetState !== 'searching') {
      setSearchText('');
      setSearchResults([]);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    }
  }, [sheetState]);

  // ─── Places API (New) search ──────────────────────────────────────────────────
  const searchPlaces = useCallback(async (input: string) => {
    if (input.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': MAPS_KEY,
        },
        body: JSON.stringify({
          input,
          locationRestriction: {
            rectangle: {
              low: { latitude: 6.33, longitude: 2.67 },
              high: { latitude: 6.72, longitude: 4.02 },
            },
          },
          includedRegionCodes: ['ng'],
        }),
      });
      const data = await response.json();
      if (data.suggestions) {
        setSearchResults(
          data.suggestions
            .filter((s: any) => s.placePrediction)
            .map((s: any) => ({
              placeId: s.placePrediction.placeId,
              mainText: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? '',
              secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text ?? '',
            }))
        );
      } else {
        setSearchResults([]);
      }
    } catch (e: any) {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchTextChange = useCallback((text: string) => {
    setSearchText(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => searchPlaces(text), 300);
  }, [searchPlaces]);

  const handlePlaceResultSelect = useCallback(async (placeId: string, mainText: string) => {
    Keyboard.dismiss();
    setSearchLoading(true);
    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}?fields=id,displayName,formattedAddress,location&key=${MAPS_KEY}`
      );
      const data = await response.json();
      if (!data.location) throw new Error('No location in place details');
      const address = data.formattedAddress || mainText;
      // Client-side Lagos safety check
      if (!address.toLowerCase().includes('lagos')) {
        Alert.alert('Not available yet', 'FlashLocum isn\'t available in this area yet.');
        return;
      }
      const place: SelectedPlace = {
        name: data.displayName?.text || mainText,
        address,
        lat: data.location.latitude,
        lng: data.location.longitude,
      };
      setSelectedPlace(place);
      setSearchText('');
      setSearchResults([]);
      // Save to recent
      if (recentPlaceKey) {
        console.log('[RequesterHome] Saving recent place for user', user?.id);
        SecureStore.setItemAsync(recentPlaceKey, JSON.stringify(place)).then(() => {
          setRecentPlace(place);
        });
      }
      transitionTo('config');
    } catch (e: any) {
      Alert.alert('Error', 'Could not load place details. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  }, [recentPlaceKey, transitionTo, user?.id]);

  // ─── Recent place tap ─────────────────────────────────────────────────────────
  const handleRecentPlaceTap = useCallback(() => {
    if (!recentPlace) return;
    console.log('[RequesterHome] Recent place tapped:', recentPlace.name);
    setSelectedPlace(recentPlace);
    if (recentPlaceKey) {
      SecureStore.setItemAsync(recentPlaceKey, JSON.stringify(recentPlace));
    }
    transitionTo('config');
  }, [recentPlace, recentPlaceKey, transitionTo]);

  // ─── Matching progress animation ─────────────────────────────────────────────
  useEffect(() => {
    if (sheetState !== 'matching') return;
    matchProgressAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(matchProgressAnim, {
        toValue: 1,
        duration: 8000,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [sheetState, matchProgressAnim]);

  // ─── Realtime matching subscription + 180s timeout ───────────────────────────
  useEffect(() => {
    if (activeRequestId) {

      matchTimerRef.current = setTimeout(() => {
        console.log('[Requester] matchTimer fired — backend is authoritative for expiry');
        handleExpiredRef.current();
      }, 180000);

      const channelName = `requester:${activeRequestId}`;
      realtimeChannelRef.current = supabase.channel(channelName)
        .on('broadcast', { event: 'MATCH_CONFIRMED' }, async (payload) => {
          console.log('[Requester] MATCH_CONFIRMED broadcast received', payload?.payload);
          if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
          const matchedSid = (payload?.payload as { session_id?: string } | undefined)?.session_id;
          if (matchedSid && AppState.currentState === 'active') {
            console.log('[Requester] MATCH_CONFIRMED — playing acceptance chime for session:', matchedSid);
            playAcceptanceChimeRef.current(matchedSid);
          }
          // Use return value directly — do NOT read activeSessionRef.current after await (stale ref)
          let session = await fetchActiveSessionRef.current();
          if (!session) {
            // Session not yet visible — retry once after 1.5s
            console.log('[Requester] MATCH_CONFIRMED — session null after first fetch, retrying in 1.5s');
            await new Promise(r => setTimeout(r, 1500));
            if (!isMountedRef.current) return;
            session = await fetchActiveSessionRef.current();
          }
          if (!isMountedRef.current) return;
          if (session) {
            // Positively confirmed — stop all recovery
            PollingManager.stop('match');
            shouldPollRef.current = false;
            if (pollIntervalRef.current) {
              clearTimeout(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            transitionToRef.current('idle');
          }
          // If still null after retry: leave doPoll running — it has no cap and will keep trying
        })
        .on('broadcast', { event: 'REQUEST_EXPIRED' }, () => {
          console.log('[Requester] REQUEST_EXPIRED broadcast received');
          handleExpiredRef.current();
        })
        .subscribe((status) => {
          console.log('[Requester] matching channel subscribe status:', status);
        });

      // One-time mount check — catches match that happened while app was backgrounded
      (async () => {
        try {
          const { data } = await supabase
            .from('coverage_requests')
            .select('status, matched_doctor_id')
            .eq('id', activeRequestId)
            .single();
          if (data?.status === 'matched' && data?.matched_doctor_id) {
            console.log('[Requester] Mount check — match already confirmed for request:', activeRequestId);
            shouldPollRef.current = false;
            if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
            // Fetch session id to play chime
            const { data: sess } = await supabase
              .from('coverage_sessions')
              .select('id')
              .eq('request_id', activeRequestId)
              .maybeSingle();
            if (sess?.id && AppState.currentState === 'active') {
              console.log('[Requester] Mount check — playing acceptance chime for session:', sess.id);
              playAcceptanceChimeRef.current(sess.id);
            }
            fetchActiveSessionRef.current();
            transitionToRef.current('idle');
          }
        } catch (e: any) {
        }
      })();

      // Poll as fallback in case MATCH_CONFIRMED broadcast was missed
      // Uses recursive setTimeout + shouldPollRef to survive StrictMode double-invocation
      shouldPollRef.current = true;

      const doPoll = async () => {
        if (!shouldPollRef.current) return;

        try {
          const { data, error } = await supabase
            .from('coverage_requests')
            .select('status, matched_doctor_id')
            .eq('id', activeRequestId)
            .single();

          if (!isMountedRef.current) return;
          if (error) {
          } else if (data?.status === 'matched' && data?.matched_doctor_id) {
            console.log('[Requester] Poll — match confirmed for request:', activeRequestId);
            shouldPollRef.current = false;
            if (matchTimerRef.current) clearTimeout(matchTimerRef.current);

            const { data: session } = await supabase
              .from('coverage_sessions')
              .select('id, doctor_name, doctor_mdcn, doctor_rating, doctor_reliability')
              .eq('request_id', activeRequestId)
              .single();

            if (!isMountedRef.current) return;
            if (session) {
              if (session.id && AppState.currentState === 'active') {
                console.log('[Requester] Poll match confirmed — playing acceptance chime for session:', session.id);
                playAcceptanceChimeRef.current(session.id);
              }
              fetchActiveSessionRef.current();
              transitionToRef.current('idle');
            }
            return; // stop polling
          } else if (data?.status === 'expired') {
            // Natural timeout — show No Doctor Accepted card
            handleExpiredRef.current();
            return;
          } else if (data?.status === 'cancelled' || data?.status === 'withdrawn') {
            // User-initiated cancel — cancel flow already handled UI
            shouldPollRef.current = false;
            return;
          }
        } catch (e: any) {
        }

        // Schedule next poll if still active
        if (shouldPollRef.current) {
          pollIntervalRef.current = setTimeout(doPoll, 3000) as any;
        }
      };

      // Start first poll immediately — no delay
      doPoll();

      return () => {
        shouldPollRef.current = false;
        if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
        if (pollIntervalRef.current) {
          clearTimeout(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (realtimeChannelRef.current) {
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }
      };
    }
    return undefined;
  }, [activeRequestId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Show tab bar only when idle ─────────────────────────────────────────────
  useEffect(() => {
    setTabBarVisible(sheetState === 'idle');
  }, [sheetState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Android back button — block dismiss during active search ─────────────────
  useEffect(() => {
    if (sheetState !== 'matching') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      console.log('[BackHandler] Back pressed during matching state — showing cancel dialog');
      Alert.alert(
        'Cancel Search?',
        'Your request is still being broadcast to nearby doctors. Are you sure you want to cancel?',
        [
          { text: 'Keep Searching', style: 'cancel' },
          {
            text: 'Cancel Request',
            style: 'destructive',
            onPress: () => handleCancelRequest(),
          },
        ],
        { cancelable: true }
      );
      return true; // prevent default back navigation
    });

    return () => subscription.remove();
  }, [sheetState, handleCancelRequest]);

  // ─── Standalone price fetch (used by both debounce and handleGoToSummary) ─────
  const fetchPreviewPrice = useCallback(async () => {
    console.log('[fetchPreviewPrice] Fetching price preview', { startTime, endTime, coverageType, environment, coverageLength });
    const shiftType = coverageType === 'Home Care' ? 'Home Care' : 'Standard';
    const toHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const d = shiftDate;
    const shiftDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setPreviewLoading(true);
    try {
      const res = await fetch(`${EDGE_BASE}/calculate-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverage_type: coverageType,
          shift_type: shiftType,
          environment,
          coverage_length: coverageLength,
          start_time: toHHMM(startTime),
          end_time: toHHMM(endTime),
          shift_date: shiftDateStr,
        }),
      });
      if (!isMountedRef.current) return;
      if (!res.ok) {
        console.log('[fetchPreviewPrice] Non-OK response:', res.status);
        setPreviewPriceError(true);
        return;
      }
      const data = await res.json();
      if (!isMountedRef.current) return;
      const receivedPrice = data.price;
      if (receivedPrice == null || !isFinite(Number(receivedPrice)) || Number(receivedPrice) <= 0) {
        console.log('[fetchPreviewPrice] Invalid price received:', receivedPrice);
        setPreviewPriceError(true);
        return;
      }
      console.log('[fetchPreviewPrice] Price received:', receivedPrice, 'hours:', data.duration_hours);
      setPreviewPriceError(false);
      setPreviewPrice(Number(receivedPrice));
      setPreviewHours(data.duration_hours ?? 0);
      setPreviewLabel(data.label ?? '');
    } catch (e: any) {
      console.log('[fetchPreviewPrice] Error:', e?.message);
      if (isMountedRef.current) setPreviewPriceError(true);
    } finally {
      if (isMountedRef.current) {
        setPreviewLoading(false);
      }
    }
  }, [startTime, endTime, coverageType, environment, coverageLength, shiftDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Debounced live price preview from calculate-price edge function ──────────
  useEffect(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    setPreviewPriceError(false); // clear error immediately on input change
    previewDebounceRef.current = setTimeout(() => {
      fetchPreviewPrice();
    }, 300);
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [startTime, endTime, coverageType, environment, coverageLength, shiftDate, fetchPreviewPrice]);

  // ─── Drag handle PanResponder ─────────────────────────────────────────────────
  const handleResetRef = useRef<() => void>(() => {});

  const dragPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: () => {},
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 15) {
          Keyboard.dismiss();
          handleResetRef.current();
        }
      },
      onPanResponderTerminate: (_, gs) => {
        if (gs.dy > 15) {
          Keyboard.dismiss();
          handleResetRef.current();
        }
      },
    })
  ).current;

  // ─── Idle card drag responder — swipe up to open search ─────────────────────
  const idleDragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderRelease: (_, gs) => {
        if (gs.dy < -20) {
          // Delegate to handleSearchTap to enforce permission check
          handleSearchTapRef.current();
        }
      },
    })
  ).current;

  // ─── Handlers ────────────────────────────────────────────────────────────────
  // Ref so the PanResponder closure always calls the latest version
  const handleSearchTapRef = useRef<() => void>(() => {});

  const handleSearchTap = useCallback(async () => {
    console.log('[Requester Home] Search tap — accountStatus:', accountStatus);
    if (isAccountBlocked) return;

    // ── Location permission gate ──────────────────────────────────────────────
    const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      if (!canAskAgain) {
        Alert.alert(
          'Location Required',
          'FlashLocum needs your location to find nearby doctors. Please enable it in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      const result = await Location.requestForegroundPermissionsAsync();
      if (result.status !== 'granted') {
        Alert.alert(
          'Location Required',
          'Location access is needed to request coverage. You can enable it in Settings.',
          [{ text: 'OK' }]
        );
        return;
      }
    }

    // Location granted — start location watch and transition to searching
    try {
      if (!locationSub.current) {
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
          (loc) => {
            if (!isMountedRef.current) return;
            const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            _cachedRequesterCoords = coords;
            setUserCoords(coords);
          }
        );
        locationSub.current = sub;
      }
    } catch (e) {
      console.log('[RequesterHome] watchPositionAsync failed:', e);
    }
    transitionTo('searching');
  }, [isAccountBlocked, accountStatus, transitionTo]);

  // Keep ref in sync
  useEffect(() => {
    handleSearchTapRef.current = handleSearchTap;
  }, [handleSearchTap]);

  const handleGoToSummary = async () => {
    if (continueProcessing) return;
    setContinueProcessing(true);
    try {
      console.log('[Requester Home] handleGoToSummary pressed — fetching fresh price before showing summary');
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
      await fetchPreviewPrice();
      // Do not proceed to summary if price is invalid
      if (previewPriceError || previewPrice <= 0) {
        console.log('[Requester Home] handleGoToSummary blocked — price invalid or error');
        return;
      }
      transitionTo('summary');
    } finally {
      setContinueProcessing(false);
    }
  };

  const handleRequestCoverage = async () => {
    console.log('[handleRequestCoverage] Submit button pressed');
    _submitRetried = false;
    if (!selectedPlace) return;
    if (!_submitIdempotencyKey) {
      _submitIdempotencyKey = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    console.log('[handleRequestCoverage] idempotency_key:', _submitIdempotencyKey);
    // Guard: ensure the selected start time is still in the future
    const startDateObj = new Date(shiftDate);
    startDateObj.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
    const minimumStart = new Date(Date.now() + 30 * 60 * 1000);
    if (startDateObj < minimumStart) {
      console.log('[handleRequestCoverage] Start time is too soon, blocking submission', startDateObj, 'minimum:', minimumStart);
      setShowEarlyStartModal(true);
      return;
    }
    setSubmitting(true);
    try {
      // Construct ISO datetime strings for start_date and end_date
      const d = shiftDate;
      const shiftDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // YYYY-MM-DD (local date, not UTC)

      const startDateObj2 = new Date(shiftDate);
      startDateObj2.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);

      const endDateObj = new Date(shiftDate);
      endDateObj.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
      if (endDateObj <= startDateObj2) {
        endDateObj.setDate(endDateObj.getDate() + 1);
      }

      const startDateISO = startDateObj2.toISOString();
      const endDateISO = endDateObj.toISOString();

      const res = await fetchWithAuth(`${SUPABASE_URL}/functions/v1/submit-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospital_name: selectedPlace.name,
          hospital_address: selectedPlace.address,
          latitude: selectedPlace.lat,
          longitude: selectedPlace.lng,
          shift_type: coverageType,
          shift_date: shiftDateStr,
          start_time: startTime.toTimeString().slice(0, 5),
          end_time: endTime.toTimeString().slice(0, 5),
          start_date: startDateISO,
          end_date: endDateISO,
          coverage_length: coverageLength,
          environment,
          note: note || null,
          idempotency_key: _submitIdempotencyKey,
        }),
      });
      const readJsonWithTimeout = <T = unknown>(r: Response, ms = 10_000): Promise<T> =>
        Promise.race([
          r.json() as Promise<T>,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Response body read timed out')), ms)
          ),
        ]);
      if (!res.ok) {
        const err = await readJsonWithTimeout(res).catch(() => ({}));
        throw new Error((err as any).error || 'Could not submit request');
      }
      const data = await readJsonWithTimeout<{ request_id?: string; id?: string; booked_price?: number }>(res);
      const reqId = data.request_id || data.id || null;
      const bookedPrice = data.booked_price ?? null;
      console.log('[handleRequestCoverage] Submission successful — request_id:', reqId, 'booked_price:', bookedPrice);
      setActiveRequestId(reqId);
      transitionTo('matching');
      _submitIdempotencyKey = null;
      console.log('[handleRequestCoverage] Idempotency key cleared');
      if (reqId) {
        // Matching window = 180s. Technical grace = 30s. Total polling lifetime = 210s.
        // interval = 5000ms → 210_000 / 5000 = 42 attempts.
        const MATCHING_WINDOW_MS = 180_000;
        const GRACE_MS = 30_000;
        const POLL_INTERVAL_MS = 5_000;
        const matchPollMaxAttempts = Math.ceil((MATCHING_WINDOW_MS + GRACE_MS) / POLL_INTERVAL_MS); // 42

        console.log('[Requester] Starting match poll for request:', reqId, '— max attempts:', matchPollMaxAttempts);
        PollingManager.start('match', async () => {
          const { data: req } = await supabase
            .from('coverage_requests')
            .select('status, matched_doctor_id')
            .eq('id', reqId)
            .maybeSingle();
          if (req?.status === 'matched' && req?.matched_doctor_id) {
            shouldPollRef.current = false;
            if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
            fetchActiveSessionRef.current();
            transitionToRef.current('idle');
            return true; // confirmed — stop polling
          }
          return false; // keep polling
        }, POLL_INTERVAL_MS, matchPollMaxAttempts, async () => {
          // Polling exhausted at ~3:30 — do a final authoritative reconciliation
          // against coverage_requests.status (NOT fetchActiveSession) before deciding UI state.
          console.warn('[Requester] match PollingManager exhausted at ~3:30 — final reconciliation');
          if (!isMountedRef.current) return;
          try {
            const { data: req } = await supabase
              .from('coverage_requests')
              .select('status, matched_doctor_id')
              .eq('id', reqId)
              .maybeSingle();
            if (!isMountedRef.current) return;
            if (req?.status === 'matched' && req?.matched_doctor_id) {
              // Doctor accepted — fetch session and transition
              shouldPollRef.current = false;
              if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
              if (pollIntervalRef.current) { clearTimeout(pollIntervalRef.current); pollIntervalRef.current = null; }
              fetchActiveSessionRef.current();
              transitionToRef.current('idle');
            } else if (req?.status === 'expired' || req?.status === 'cancelled' || req?.status === 'withdrawn') {
              // Terminal state — doPoll or matchTimer will handle the correct UI transition
              // (handleExpiredRef for expired, shouldPollRef=false for cancelled/withdrawn)
              // Do NOT call transitionTo('idle') here — let the existing handlers fire
              console.log('[Requester] match PollingManager exhausted — request already terminal:', req?.status);
            }
            // If still 'pending': the request is still live — do nothing. doPoll continues.
          } catch (e) {
            console.warn('[Requester] match PollingManager exhausted — reconciliation fetch failed', e);
          }
        });
      }
    } catch (e: any) {
      const isNetworkErr = e instanceof TypeError &&
        (e.message?.includes('Network request failed') || e.message?.includes('network'));
      if (isNetworkErr && !_submitRetried) {
        _submitRetried = true;
        console.log('[Requester] Network error on submit — retrying in 1.5s');
        await new Promise(r => setTimeout(r, 1500));
        await handleRequestCoverage();
        return;
      }
      Alert.alert('Error', 'Could not submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = useCallback(() => {
    console.log('[handleReset] Resetting request state');
    _submitIdempotencyKey = null;
    setSelectedPlace(null);
    setCoverageType('Standard');
    setShiftDate(new Date());
    const s = new Date(); s.setHours(8, 0, 0, 0);
    setStartTime(s);
    const e = new Date(); e.setHours(18, 0, 0, 0);
    setEndTime(e);
    setCoverageLength(1);
    setEnvironment('Normal');
    setNote('');
    setActiveRequestId(null);
    transitionTo('idle');
  }, [transitionTo]);

  // Keep ref in sync so PanResponder can call it
  useEffect(() => {
    handleResetRef.current = handleReset;
  }, [handleReset]);

  // ─── Single convergence point for all expiry signals ─────────────────────────
  // Called by: client timer, REQUEST_EXPIRED broadcast, polling, app-restore.
  // Idempotent — functional setState ensures only the first call transitions.
  const handleExpired = useCallback(() => {
    shouldPollRef.current = false;
    if (pollIntervalRef.current) { clearTimeout(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (matchTimerRef.current) { clearTimeout(matchTimerRef.current); matchTimerRef.current = null; }
    if (!isMountedRef.current) return;
    setSheetState(prev => {
      if (prev !== 'matching') return prev; // already transitioned — no-op
      return prev; // sheetState stays 'matching' — Finding Medical Officer remains visible
    });
    setShowExpiredModal(true);
  }, []);

  const handleExpiredRef = useRef(handleExpired);
  useEffect(() => { handleExpiredRef.current = handleExpired; }, [handleExpired]);

  const handleEditRequest = async () => {
    console.log('[Requester] handleEditRequest pressed', { activeRequestId, sheetState });
    setShowExpiredModal(false);
    // Only withdraw if the request is still live — from expired state the backend already terminated it
    if (activeRequestId && !showExpiredModal) {
      try {
        const res = await fetchWithAuth(`${SUPABASE_URL}/functions/v1/withdraw-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: activeRequestId }),
        });
        if (res.status === 409) {
          const body = await res.json().catch(() => ({}));
          if (body.error === 'SHIFT_LOCKED') {
            const { data: reqCheck } = await supabase
              .from('coverage_requests')
              .select('status, matched_doctor_id')
              .eq('id', activeRequestId)
              .maybeSingle();
            if (reqCheck?.status === 'matched' && reqCheck?.matched_doctor_id) {
              await fetchActiveSession();
              Alert.alert('Request Already Accepted', 'A doctor just accepted your request. Check your Upcoming Coverage.');
              return;
            }
            // Transient lock — retry once after 1500ms then proceed regardless
            console.log('[Requester] handleEditRequest — transient SHIFT_LOCKED, retrying in 1.5s');
            await new Promise(r => setTimeout(r, 1500));
            try {
              const retryRes = await fetchWithAuth(`${SUPABASE_URL}/functions/v1/withdraw-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: activeRequestId }),
              });
              if (retryRes.status === 409) {
                const retryBody = await retryRes.json().catch(() => ({}));
                if (retryBody.error === 'SHIFT_LOCKED') {
                  const { data: reqCheck2 } = await supabase
                    .from('coverage_requests')
                    .select('status, matched_doctor_id')
                    .eq('id', activeRequestId)
                    .maybeSingle();
                  if (reqCheck2?.status === 'matched' && reqCheck2?.matched_doctor_id) {
                    await fetchActiveSession();
                    Alert.alert('Request Already Accepted', 'A doctor just accepted your request. Check your Upcoming Coverage.');
                    return;
                  }
                  // Still locked — proceed to config anyway (Edit's acceptable failure mode)
                }
              }
            } catch {}
          }
        }
      } catch {}
    }
    if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    setActiveRequestId(null);
    transitionTo('config');
  };

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [showEarlyStartModal, setShowEarlyStartModal] = useState(false);
  const [showCancelReasons, setShowCancelReasons] = useState(false);
  const [cancelWithdrawn, setCancelWithdrawn] = useState(false);
  const [showCancelActiveModal, setShowCancelActiveModal] = useState(false);
  const [showCancelActiveReasons, setShowCancelActiveReasons] = useState(false);
  const [showEndShiftModal, setShowEndShiftModal] = useState(false);
  const [showPauseShiftModal, setShowPauseShiftModal] = useState(false);
  const [settledAmount, setSettledAmount] = useState<number | null>(null);


  const handleCancelRequest = useCallback(async () => {
    console.log('[Requester] handleCancelRequest pressed', { activeRequestId });
    if (!activeRequestId) return;

    // Helper: attempt one withdraw-request call. Returns 'success' | 'matched' | 'locked' | 'error'.
    const attemptWithdraw = async (): Promise<'success' | 'matched' | 'locked' | 'error'> => {
      try {
        const res = await fetchWithAuth(`${SUPABASE_URL}/functions/v1/withdraw-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: activeRequestId }),
        });
        if (res.ok) return 'success';
        if (res.status === 409) {
          const body = await res.json().catch(() => ({}));
          if (body.error === 'SHIFT_LOCKED') return 'locked';
        }
        return 'error';
      } catch {
        return 'error';
      }
    };

    // Helper: check DB status. Returns 'matched' | 'pending' | 'unknown'.
    const checkDB = async (): Promise<'matched' | 'pending' | 'unknown'> => {
      try {
        const { data } = await supabase
          .from('coverage_requests')
          .select('status, matched_doctor_id')
          .eq('id', activeRequestId)
          .maybeSingle();
        if (data?.status === 'matched' && data?.matched_doctor_id) return 'matched';
        if (data?.status === 'pending') return 'pending';
        return 'unknown';
      } catch {
        return 'unknown';
      }
    };

    let result = await attemptWithdraw();

    if (result === 'locked') {
      console.log('[Requester] handleCancelRequest — SHIFT_LOCKED, verifying DB status');
      const dbStatus = await checkDB();
      if (dbStatus === 'matched') {
        console.log('[Requester] handleCancelRequest — DB confirms matched, showing alert');
        await fetchActiveSession();
        Alert.alert('Request Already Accepted', 'A doctor just accepted your request. Check your Upcoming Coverage.');
        return;
      }
      // Transient lock (accept-request in flight, DB still pending) — wait and retry once.
      // accept-request completes in ~1-2s; lock TTL is 10s. 1500ms covers the window.
      console.log('[Requester] handleCancelRequest — transient SHIFT_LOCKED, retrying in 1.5s');
      await new Promise(r => setTimeout(r, 1500));
      result = await attemptWithdraw();

      if (result === 'locked') {
        // Second attempt also locked — re-check DB
        const dbStatus2 = await checkDB();
        if (dbStatus2 === 'matched') {
          console.log('[Requester] handleCancelRequest — retry: DB confirms matched, showing alert');
          await fetchActiveSession();
          Alert.alert('Request Already Accepted', 'A doctor just accepted your request. Check your Upcoming Coverage.');
          return;
        }
        // Still locked after retry — do not show modal, do not set cancelWithdrawn
        console.log('[Requester] handleCancelRequest — retry: still SHIFT_LOCKED, aborting cancel');
        return;
      }
    }

    if (result !== 'success') {
      // withdraw-request failed for a non-lock reason — do not show modal
      console.log('[Requester] handleCancelRequest — withdrawal failed, aborting cancel');
      return;
    }

    // Withdrawal confirmed — now show the modal
    console.log('[Requester] handleCancelRequest — withdrawal confirmed, showing cancel modal');
    setCancelWithdrawn(true);
    setShowCancelModal(true);
  }, [activeRequestId, fetchActiveSession]);

  const handleWaitForDoctor = async () => {
    setShowCancelModal(false);
    if (activeRequestId && cancelWithdrawn) {
      try {
        await fetchWithAuth(`${SUPABASE_URL}/functions/v1/rebroadcast-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: activeRequestId }),
        });
      } catch (e) {
      }
    }
    setCancelWithdrawn(false);
  };

  const handleConfirmCancel = () => {
    setShowCancelModal(false);
    setShowCancelReasons(true);
  };

  const handlePaymentConfirmed = useCallback(() => {
    const snap = activeSessionRef.current;
    if (snap && !_requesterPaidSessions.has(snap.id) && !_requesterRatingInFlight.has(snap.id) && !_requesterDismissedSessions.has(snap.id)) {
      setConfirmedSession(snap);
      setShowPaymentSuccess(true);
    }
    setActiveSession(null);
  }, []); // no deps — reads from ref so never goes stale

  const fetchAndSetSettledAmount = useCallback(async (sessionId: string) => {
    try {
      console.log('[Requester] fetchAndSetSettledAmount — fetching payment_intents for session', sessionId);
      const { data } = await supabase
        .from('payment_intents')
        .select('amount_paid')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data?.amount_paid != null) {
        console.log('[Requester] fetchAndSetSettledAmount — amount_paid:', data.amount_paid);
        setSettledAmount(Number(data.amount_paid));
      }
    } catch {
      // non-fatal — overlay will fall back to confirmedSession.price
    }
  }, []);

  const handlePaymentConfirmedWithFallback = useCallback(async (sessionIdFromPayload?: string, paymentConfirmedAt?: string) => {
    const currentSession = activeSessionRef.current;
    const sid = sessionIdFromPayload ?? currentSession?.id;

    if (currentSession) {
      // 5-minute expiry check — use paymentConfirmedAt from broadcast payload (authoritative)
      if (paymentConfirmedAt) {
        const ageMs = Date.now() - new Date(paymentConfirmedAt).getTime();
        if (ageMs > 5 * 60 * 1000) {
          console.log('[Requester] handlePaymentConfirmedWithFallback — rating window expired (>5 min), suppressing overlay');
          return;
        }
      }
      // Happy path — ref is populated, show overlay IMMEDIATELY then dedup in background
      if (sid && !_requesterPaidSessions.has(sid) && !_requesterRatingInFlight.has(sid) && !_requesterDismissedSessions.has(sid)) {
        // Fire-and-forget fetch of authoritative amount — overlay reads settledAmount reactively
        void fetchAndSetSettledAmount(sid);
        // Show immediately — do NOT block on AsyncStorage
        setConfirmedSession(currentSession);
        setShowPaymentSuccess(true);
        _requesterRatingInFlight.add(sid);
        // Background dedup check — if already handled, hide overlay
        isRequesterSessionPaid(sid).then((alreadyHandled) => {
          if (!isMountedRef.current) return;
          _requesterRatingInFlight.delete(sid);
          if (alreadyHandled) {
            setShowPaymentSuccess(false);
            setConfirmedSession(null);
          }
          // If not already handled, overlay stays visible — nothing to do
        }).catch(() => { _requesterRatingInFlight.delete(sid); });
      }
      setActiveSession((prev) => prev ? { ...prev, status: 'requester_paid' } : prev);
      fetchActiveSession();
    } else {
      // Android timing gap — ref is null, fetch session then show overlay IMMEDIATELY
      setActiveSession((prev) => prev ? { ...prev, status: 'requester_paid' } : prev);
      try {
        const res = await fetchWithAuth(`${EDGE_BASE}/get-active-session?role=requester`, {});
        if (!isMountedRef.current) return;
        if (!res.ok) return;
        const data = await res.json();
        if (!isMountedRef.current) return;
        const session = data?.session ?? null;
        if (!session) return;
        // 5-minute expiry check using DB timestamp (no broadcast payload available in this path)
        if (session.payment_complete_at) {
          const ageMs = Date.now() - new Date(session.payment_complete_at).getTime();
          if (ageMs > 5 * 60 * 1000) {
            console.log('[Requester] handlePaymentConfirmedWithFallback (fallback) — rating window expired (>5 min), suppressing overlay');
            return;
          }
        }
        setActiveSession(session);
        _cachedActiveSession = session;
        _sessionCachePopulated = true;
        const fetchedSid = sessionIdFromPayload ?? session.id;
        if (
          (session.status === 'requester_paid' || session.status === 'settled') &&
          fetchedSid &&
          !_requesterPaidSessions.has(fetchedSid) &&
          !_requesterRatingInFlight.has(fetchedSid) &&
          !_requesterDismissedSessions.has(fetchedSid)
        ) {
          // Fire-and-forget fetch of authoritative amount — overlay reads settledAmount reactively
          void fetchAndSetSettledAmount(fetchedSid);
          // Show overlay IMMEDIATELY
          setConfirmedSession(session);
          setShowPaymentSuccess(true);
          _requesterRatingInFlight.add(fetchedSid);
          // Background dedup check — if already handled, hide overlay
          isRequesterSessionPaid(fetchedSid).then((alreadyHandled) => {
            if (!isMountedRef.current) return;
            _requesterRatingInFlight.delete(fetchedSid);
            if (alreadyHandled) {
              setShowPaymentSuccess(false);
              setConfirmedSession(null);
            }
          }).catch(() => { _requesterRatingInFlight.delete(fetchedSid); });
        }
      } catch (e: any) {
        // Non-fatal — fall back to normal fetchActiveSession
        fetchActiveSession();
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Requester payment polling fallback: polls get-active-session every 5s (no cap) ──
  const startRequesterPaymentPolling = useCallback(() => {
    console.log('[Requester] startRequesterPaymentPolling — polling for paid status (no cap)');
    PollingManager.start('payment-confirm', async () => {
      try {
        const res = await fetchWithAuth(`${EDGE_BASE}/get-active-session?role=requester`, {});
        if (res.ok) {
          const data = await res.json();
          const snap = data?.session ?? null;
          const paidStatuses = ['requester_paid'];
          if (snap && paidStatuses.includes(snap.status)) {
            console.log('[Requester] paymentPoll — paid status confirmed:', snap.status, '— showing overlay');
            // 5-minute expiry check
            if (snap.payment_complete_at) {
              const ageMs = Date.now() - new Date(snap.payment_complete_at).getTime();
              if (ageMs > 5 * 60 * 1000) {
                console.log('[Requester] paymentPoll — rating window expired (>5 min), stopping poll');
                return true; // stop polling — window is closed
              }
            }
            if (!_requesterPaidSessions.has(snap.id) && !_requesterDismissedSessions.has(snap.id)) {
              handlePaymentConfirmedWithFallback(snap.id);
            }
            return true;
          }
        }
      } catch {
        // non-fatal
      }
      return false;
    }, undefined, 180);
  }, [handlePaymentConfirmedWithFallback, activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep refs in sync so effects declared before these callbacks can call them without stale closures
  useEffect(() => { handlePaymentConfirmedWithFallbackRef.current = handlePaymentConfirmedWithFallback; }, [handlePaymentConfirmedWithFallback]);
  useEffect(() => { startRequesterPaymentPollingRef.current = startRequesterPaymentPolling; }, [startRequesterPaymentPolling]);

  const handleCancelReasonSelected = async (reason: string) => {
    console.log('[Requester] Cancel reason selected:', reason, 'for request:', activeRequestId);
    if (activeRequestId) {
      try {
        const res = await fetchWithAuth(`${EDGE_BASE}/cancel-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: activeRequestId, cancellation_reason: reason }),
        });
        if (res.status === 409) {
          const body = await res.json().catch(() => ({}));
          if (body.error === 'SESSION_EXISTS') {
            // A doctor accepted mid-cancel — show the session instead
            setShowCancelReasons(false);
            setCancelWithdrawn(false);
            await fetchActiveSession();
            Alert.alert('Request Already Accepted', 'A doctor accepted your request just before you cancelled. Check your Upcoming Coverage.');
            return;
          }
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error('[Requester] cancel-request failed:', body);
          // Non-fatal — still reset UI so user is not stuck
        } else {
          console.log('[Requester] Cancellation recorded successfully via edge function');
        }
      } catch (e) {
        console.error('[Requester] Exception calling cancel-request:', e);
        // Non-fatal — still reset UI
      }
    }
    setShowCancelReasons(false);
    setCancelWithdrawn(false);
    handleReset();
  };

  // ─── Session action handlers ──────────────────────────────────────────────────
  const callSessionEdge = useCallback(async (fn: string, sessionId: string) => {
    const doRequest = async () => {
      const res = await fetchWithAuth(`${EDGE_BASE}/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errBody = await res.json();
          errMsg = errBody.error || errBody.message || errMsg;
        } catch {
          try { errMsg = (await res.text()) || errMsg; } catch {}
        }
        throw new Error(errMsg);
      }
      return res.json();
    };
    try {
      return await doRequest();
    } catch (err: any) {
      const isNetworkErr = err instanceof TypeError &&
        (err.message?.includes('Network request failed') || err.message?.includes('network'));
      if (isNetworkErr) {
        console.log('[Requester] Network error on session action — retrying in 1s');
        await new Promise(r => setTimeout(r, 1000));
        return doRequest();
      }
      throw err;
    }
  }, []);

  const handleStartShift = useCallback(async () => {
    if (!activeSession) return;
    if (startShiftProcessing) return;
    setStartShiftProcessing(true);
    const sid = activeSession.id;
    try {
      console.log('[Requester] handleStartShift for session:', sid);
      const data = await callSessionEdge('start-shift', sid);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? mergeSession(prev, updated) : prev);
      console.log('[Requester] Starting start-shift poll for session:', sid);
      PollingManager.start('start-shift', async () => {
        const { data: s } = await supabase
          .from('coverage_sessions')
          .select('status')
          .eq('id', sid)
          .maybeSingle();
        if (s?.status === 'active') {
          fetchActiveSessionRef.current();
          return true;
        }
        return false;
      }, undefined, 6);
    } catch (e: any) {
      const startMsg = (() => {
        const m = (e?.message ?? '').toLowerCase();
        if (m.includes('cannot start') || m.includes('not_startable') || m.includes('shift_not_startable')) return 'This shift can\'t be started right now.';
        if (m.includes('already active') || m.includes('status: active')) return 'You already have an active shift.';
        return 'Something went wrong. Please try again.';
      })();
      Alert.alert('Start Shift', startMsg);
    } finally {
      setStartShiftProcessing(false);
    }
  }, [activeSession, callSessionEdge, startShiftProcessing]);

  const handleResumeShift = useCallback(async () => {
    if (!activeSession) return;
    if (resumeShiftProcessing) return;
    setResumeShiftProcessing(true);
    const sid = activeSession.id;
    try {
      const data = await callSessionEdge('resume-shift', sid);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? mergeSession(prev, updated) : prev);
      PollingManager.start('resume-shift', async () => {
        const { data: s } = await supabase
          .from('coverage_sessions')
          .select('status')
          .eq('id', sid)
          .maybeSingle();
        if (s?.status === 'active') {
          fetchActiveSessionRef.current();
          return true;
        }
        return false;
      }, undefined, 6);
    } catch (e: any) {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setResumeShiftProcessing(false);
    }
  }, [activeSession, callSessionEdge, resumeShiftProcessing]);

  const handlePauseShift = useCallback(async () => {
    if (!activeSession) return;
    setShowPauseShiftModal(true);
  }, [activeSession]);

  const handleConfirmPauseShift = async () => {
    if (!activeSession) return;
    if (pauseShiftProcessing) return;
    setPauseShiftProcessing(true);
    const sid = activeSession.id;
    setShowPauseShiftModal(false);
    try {
      console.log('[Requester] handleConfirmPauseShift for session:', sid);
      const data = await callSessionEdge('pause-shift', sid);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? mergeSession(prev, updated) : prev);
      console.log('[Requester] Starting pause-shift poll for session:', sid);
      PollingManager.start('pause-shift', async () => {
        const { data: s } = await supabase
          .from('coverage_sessions')
          .select('status')
          .eq('id', sid)
          .maybeSingle();
        if (s?.status === 'paused' || s?.status === 'upcoming') {
          fetchActiveSessionRef.current();
          return true;
        }
        return false;
      }, undefined, 6);
    } catch (e: any) {
      const pauseMsg = (() => {
        const m = (e?.message ?? '').toLowerCase();
        if (m.includes('already paused') || m.includes('status: paused') || m.includes('shift_not_pausable')) return 'This shift is already paused.';
        if (m.includes('cannot pause') || m.includes('not_pausable')) return 'This shift can\'t be paused right now.';
        return 'Something went wrong. Please try again.';
      })();
      Alert.alert('Pause Shift', pauseMsg);
    } finally {
      setPauseShiftProcessing(false);
    }
  };

  const handleEndShift = useCallback(async () => {
    if (!activeSession) return;
    setShowEndShiftModal(true);
  }, [activeSession]);

  const handleConfirmEndShift = async () => {
    if (!activeSession) return;
    if (endShiftProcessing) return;
    setEndShiftProcessing(true);
    const sid = activeSession.id;
    // Clear from paid/dismissed sets so day 2+ of multi-day shifts can trigger the overlay again
    _requesterPaidSessions.delete(sid);
    _requesterDismissedSessions.delete(sid);
    console.log('[Requester] handleConfirmEndShift: ending shift for session', sid);
    setShowEndShiftModal(false);
    try {
      const data = await callSessionEdge('end-shift', sid);
      console.log('[Requester] end-shift response:', JSON.stringify(data));
      const updated = data?.session as Partial<CoverageSession> | undefined;
      // Seed payment details from response — eliminates race condition with DB insert
      const paymentFromResponse = data?.payment ?? null;
      // Always transition to payment_pending — do not gate on data.session being truthy.
      // If data.session is null (edge case), we still know the API succeeded and the session
      // is now payment_pending. The payment card must render.
      // Store _initialPayment atomically on the session object to avoid timing gaps.
      setActiveSession((prev) => {
        if (!prev) return prev;
        // Resolve the final price: prefer the backend-calculated value, fall back to the
        // frozen booking price. Never allow 0 or null to overwrite a valid booked price.
        const backendPrice = updated?.price != null && isFinite(Number(updated.price)) && Number(updated.price) > 0
          ? Number(updated.price)
          : null;
        const bookedFallback = prev.booked_price != null && isFinite(Number(prev.booked_price)) && Number(prev.booked_price) > 0
          ? Number(prev.booked_price)
          : prev.price > 0 ? prev.price : null;
        const resolvedPrice = backendPrice ?? bookedFallback ?? prev.price;
        return {
          ...prev,
          ...(updated ?? {}),
          price: resolvedPrice,
          status: 'payment_pending',
          _initialPayment: paymentFromResponse?.account_number ? paymentFromResponse : null,
        };
      });
      if (updated?.price != null) {
        console.log('[Requester] end-shift updated price from backend:', updated.price);
      }
      console.log('[Requester] Starting end-shift poll for session:', sid);
      PollingManager.start('end-shift', async () => {
        const { data: s } = await supabase
          .from('coverage_sessions')
          .select('status, payment_status')
          .eq('id', sid)
          .maybeSingle();
        if (s?.status === 'payment_pending' || s?.status === 'completed' || s?.status === 'requester_paid') {
          return true;
        }
        return false;
      }, undefined, 6);
    } catch (e: any) {
      console.error('[Requester] end-shift failed:', e.message);
      const endMsg = (() => {
        const m = (e?.message ?? '').toLowerCase();
        if (m.includes('payment_pending') || m.includes('already ended') || m.includes('shift_not_endable')) return 'This shift has already ended.';
        if (m.includes('cannot end') || m.includes('not_endable')) return 'This shift can\'t be ended right now.';
        return 'Something went wrong. Please try again.';
      })();
      Alert.alert('End Shift', endMsg);
    } finally {
      setEndShiftProcessing(false);
    }
  };



  const handleCancelActiveShift = useCallback(() => {
    if (!activeSession) return;
    setShowCancelActiveModal(true);
  }, [activeSession]);

  const handleConfirmCancelActive = () => {
    setShowCancelActiveModal(false);
    setShowCancelActiveReasons(true);
  };

  const handleCancelActiveReasonSelected = async (reason: string) => {
    if (!activeSession) return;
    if (cancelShiftProcessing) return;
    setCancelShiftProcessing(true);
    setShowCancelActiveReasons(false);
    const sessionId = activeSession.id;
    // Clear immediately so the search card appears right away
    setActiveSession(null);
    const doCancelRequest = async () => {
      const res = await fetchWithAuth(`${EDGE_BASE}/update-shift-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, status: 'cancelled', cancellation_reason: reason, cancelled_by: 'requester' }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || 'Cancel failed');
      }
    };
    try {
      await doCancelRequest();
      console.log('[Requester] Starting cancel poll for session:', sessionId);
      PollingManager.start('cancel', async () => {
        const { data: s } = await supabase
          .from('coverage_sessions')
          .select('status')
          .eq('id', sessionId)
          .maybeSingle();
        if (s?.status === 'cancelled') {
          fetchActiveSessionRef.current();
          return true;
        }
        return false;
      }, undefined, 6);
    } catch (e: any) {
      const isNetworkErr = e instanceof TypeError &&
        (e.message?.includes('Network request failed') || e.message?.includes('network'));
      if (isNetworkErr) {
        console.log('[Requester] Network error on cancel — retrying in 1s');
        await new Promise(r => setTimeout(r, 1000));
        try {
          await doCancelRequest();
          PollingManager.start('cancel', async () => {
            const { data: s } = await supabase
              .from('coverage_sessions')
              .select('status')
              .eq('id', sessionId)
              .maybeSingle();
            if (s?.status === 'cancelled') {
              fetchActiveSessionRef.current();
              return true;
            }
            return false;
          }, undefined, 6);
          return;
        } catch (retryErr: any) {
          Alert.alert('Cancel Shift', 'Something went wrong. Please try again.');
          fetchActiveSession();
          return;
        }
      }
      Alert.alert('Error', e.message);
      // Re-fetch to restore correct state if the API call failed
      fetchActiveSession();
    } finally {
      setCancelShiftProcessing(false);
    }
  };

  const handleCallDoctor = useCallback(() => {
    if (!activeSession?.doctor_phone) {
      Alert.alert('No phone number available');
      return;
    }
    Linking.openURL(`tel:${activeSession.doctor_phone}`);
  }, [activeSession]);

  // ─── Derived display values ───────────────────────────────────────────────────
  const formattedDate = shiftDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formattedDateShort = shiftDate.toLocaleDateString('en-US', { weekday: 'short' });
  const formattedStartTime = startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const formattedEndTime = endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const coveragePriceDisplay = `₦${previewPrice.toLocaleString()}`;
  const coverageSubtitle = previewLabel;
  const summaryPillText = `${coverageType} · ${formattedDateShort} · ${formattedStartTime}`;
  const coverageLengthLabel = coverageLength === 1 ? '1 day' : `${coverageLength} days`;
  const coverageTypeDesc = coverageType === 'Standard'
    ? 'For hospitals, clinics, facilities, and medical centers.'
    : 'For home visits and personal care.';
  const environmentDesc = environment === 'Normal'
    ? 'Standard working conditions.'
    : 'High patient volume expected.';

  const whiteCardPaddingBottom = TAB_BAR_HEIGHT + insets.bottom + 16;

  // Max date = today + 15 days
  const maxDate = new Date(new Date().getTime() + 15 * 24 * 60 * 60 * 1000);

  const isPlusDisabled = coverageLength >= 15;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary
      fallback={
        <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#1a1a1a', textAlign: 'center', marginBottom: 12 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>
            Please close and reopen FlashLocum.
          </Text>
        </View>
      }
      onError={(error, info) => console.error('[RequesterPortal] Render error:', error, info)}
    >
    <View style={{ flex: 1, backgroundColor: '#F9F9F6' }}>

      {/* ── FULL-SCREEN MAP (always behind everything) ── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={_cachedRequesterRegion ?? LAGOS_REGION}
        onRegionChangeComplete={(region) => {
          _cachedRequesterRegion = region;
          setMapRegion(region);
        }}
        customMapStyle={MINIMALIST_MAP_STYLE}
        minZoomLevel={10}
        maxZoomLevel={18}
        onMapReady={() => {
          console.log('[Map] onMapReady fired');
          setMapReady(true);
          const region = _cachedRequesterRegion ?? LAGOS_REGION;
          setMapRegion(region);
        }}
      >
        {userCoords && (
          <Marker coordinate={userCoords} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={userMarkerTracksViews}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#F59E0B', borderWidth: 2.5, borderColor: '#FFFFFF' }} />
          </Marker>
        )}
        {clusters.map((point) => {
          const [lng, lat] = point.geometry.coordinates;
          const { cluster: isCluster, point_count: pointCount } = point.properties as any;

          if (isCluster) {
            return (
              <Marker
                key={`cluster-${point.id}`}
                coordinate={{ latitude: lat, longitude: lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={doctorMarkerTracksViews}
                onPress={() => {
                  console.log('[Map] Cluster marker pressed', { clusterId: point.id, pointCount });
                  if (!supercluster) return;
                  const expansionZoom = Math.min(
                    supercluster.getClusterExpansionZoom(point.id as number),
                    20
                  );
                  const newRegion = {
                    latitude: lat,
                    longitude: lng,
                    latitudeDelta: 360 / Math.pow(2, expansionZoom) * 0.5,
                    longitudeDelta: 360 / Math.pow(2, expansionZoom) * 0.5,
                  };
                  mapRef.current?.animateToRegion(newRegion, 400);
                }}
              >
                <View style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: '#1C1C1E',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.25,
                  shadowRadius: 4,
                  elevation: 5,
                }}>
                  <MaterialCommunityIcons name="stethoscope" size={10} color="#FFFFFF" />
                  <Text style={{
                    color: '#FFFFFF',
                    fontSize: 9,
                    fontWeight: '700',
                    lineHeight: 11,
                  }}>
                    {pointCount}
                  </Text>
                </View>
              </Marker>
            );
          }

          // Individual doctor marker
          const doctorId = (point.properties as any).doctorId;
          return (
            <Marker
              key={`doctor-${doctorId}`}
              coordinate={{ latitude: lat, longitude: lng }}
              anchor={{ x: 0.5, y: 1.0 }}
              tracksViewChanges={doctorMarkerTracksViews}
            >
              <View style={{ alignItems: 'center' }}>
                {/* Circular pin head — flat */}
                <View style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: '#D3D3D3',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: '#FFFFFF',
                  zIndex: 2,
                }}>
                  <MaterialCommunityIcons name="stethoscope" size={11} color="#FFFFFF" />
                  {/* Green online dot */}
                  <View style={{
                    position: 'absolute',
                    top: 1,
                    right: 1,
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: '#22C55E',
                    borderWidth: 1,
                    borderColor: '#FFFFFF',
                  }} />
                </View>
                {/* Tail */}
                <View style={{
                  width: 6,
                  height: 5,
                  backgroundColor: '#D3D3D3',
                  borderBottomLeftRadius: 3,
                  borderBottomRightRadius: 3,
                  marginTop: -2,
                  zIndex: 1,
                }} />
              </View>
            </Marker>
          );
        })}
      </MapView>



      {/* ── SUMMARY BACK BUTTON ── */}
      {sheetState === 'summary' && (
        <TouchableOpacity
          onPress={() => transitionTo('config')}
          activeOpacity={0.85}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            left: 16,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#2B2B2B',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <ArrowLeft size={20} color="#F5F5F0" />
        </TouchableOpacity>
      )}

      {/* ── NON-IDLE ANIMATED SHEET ── */}
      {sheetState !== 'idle' && (
        <Animated.View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: sheetAnim,
          backgroundColor: '#1C1C1E',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          shadowColor: '#000', shadowOffset: { width: -4, height: 0 }, shadowOpacity: 0.10, shadowRadius: 16, elevation: 12,
          overflow: 'visible',
        }}>
          {/* SEARCHING */}
          {sheetState === 'searching' && (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <Pressable onPress={() => Keyboard.dismiss()} style={{ flex: 1, paddingTop: 20 }}>
                <DragHandle panHandlers={dragPanResponder.panHandlers} />

                {/* Search input */}
                <View style={{
                  marginHorizontal: 16,
                  marginTop: 8,
                  marginBottom: 8,
                  backgroundColor: '#2C2C2E',
                  borderRadius: 28,
                  borderWidth: 2,
                  borderColor: '#3A3A3C',
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  height: 50,
                }}>
                  <Search size={20} color="#8E8E93" strokeWidth={2.5} style={{ marginRight: 10 }} />
                  <TextInput
                    autoFocus
                    value={searchText}
                    onChangeText={handleSearchTextChange}
                    placeholder="Where is coverage needed?"
                    placeholderTextColor={COLORS.textTertiary}
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color: '#FFFFFF',
                      height: 50,
                    }}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                  />
                  {searchLoading && (
                    <ActivityIndicator size="small" color={COLORS.textTertiary} />
                  )}
                </View>

                {/* Recent place — shown only when search is empty */}
                {searchText.length === 0 && recentPlace !== null && (
                  <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 }}>
                      <History size={13} color={COLORS.textTertiary} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textTertiary, letterSpacing: 0.8 }}>
                        RECENT
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={handleRecentPlaceTap}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        backgroundColor: '#2C2C2E',
                        borderRadius: 12,
                        gap: 12,
                      }}
                    >
                      <View style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: '#3A3A3C',
                        justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                      }}>
                        <MapPin size={16} color={COLORS.textTertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }} numberOfLines={1}>
                          {recentPlace.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }} numberOfLines={1}>
                          {recentPlace.address}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Results list */}
                {searchResults.length > 0 && (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    style={{
                      marginHorizontal: 16,
                      backgroundColor: '#2C2C2E',
                      borderRadius: 12,
                      maxHeight: 300,
                    }}
                    showsVerticalScrollIndicator={false}
                  >
                    {searchResults.map((result, index) => (
                      <TouchableOpacity
                        key={result.placeId}
                        onPress={() => handlePlaceResultSelect(result.placeId, result.mainText)}
                        activeOpacity={0.7}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderBottomWidth: index < searchResults.length - 1 ? 1 : 0,
                          borderBottomColor: '#3A3A3C',
                          gap: 12,
                        }}
                      >
                        <View style={{
                          width: 36, height: 36, borderRadius: 18,
                          backgroundColor: '#3A3A3C',
                          justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                        }}>
                          <MapPin size={16} color={COLORS.textTertiary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }} numberOfLines={1}>
                            {result.mainText}
                          </Text>
                          {result.secondaryText ? (
                            <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }} numberOfLines={1}>
                              {result.secondaryText}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {/* Empty state — only show after typing with no results */}
                {!searchLoading && searchText.length >= 2 && searchResults.length === 0 && (
                  <View style={{ alignItems: 'center', paddingTop: 32 }}>
                    <Text style={{ fontSize: 14, color: '#8E8E93' }}>No places found in Lagos</Text>
                  </View>
                )}
              </Pressable>
            </KeyboardAvoidingView>
          )}

          {/* CONFIG */}
          {sheetState === 'config' && (
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior="padding"
              keyboardVerticalOffset={0}
            >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 80 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <DragHandle panHandlers={dragPanResponder.panHandlers} />

              {/* Search row — tappable back to searching */}
              <TouchableOpacity
                onPress={handleSearchTap}
                activeOpacity={0.8}
                style={{
                  backgroundColor: '#2C2C2E',
                  borderRadius: 28,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <Search size={18} color="#8E8E93" />
                <Text style={[TYPOGRAPHY.body, { color: '#8E8E93' }]}>
                  Where is coverage needed?
                </Text>
              </TouchableOpacity>

              {/* Selected location capsule — ITEM 1 */}
              {selectedPlace && (
                <View style={{
                  backgroundColor: '#2C2C2E',
                  borderRadius: 28,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 16,
                }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#2DC653', flexShrink: 0 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[TYPOGRAPHY.bodyMedium, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">
                      {selectedPlace.name}
                    </Text>
                    <Text style={[TYPOGRAPHY.caption, { color: '#D1D1D6' }]} numberOfLines={1} ellipsizeMode="tail">
                      {selectedPlace.address}
                    </Text>
                  </View>
                </View>
              )}

              {/* Coverage type toggle */}
              <View style={{ marginBottom: 8 }}>
                <View style={{
                  flexDirection: 'row',
                  backgroundColor: '#F9F9F6',
                  borderRadius: RADIUS.full,
                  padding: 4,
                  alignSelf: 'flex-start',
                }}>
                  <TouchableOpacity
                    onPress={() => {
                      setCoverageType('Standard');
                    }}
                    style={{
                      backgroundColor: coverageType === 'Standard' ? '#1C1C1E' : 'transparent',
                      borderRadius: RADIUS.full,
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={[TYPOGRAPHY.bodyMedium, { color: coverageType === 'Standard' ? '#FFFFFF' : '#1C1C1E' }]}>
                      Standard
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setCoverageType('Home Care');
                    }}
                    style={{
                      backgroundColor: coverageType === 'Home Care' ? '#1C1C1E' : 'transparent',
                      borderRadius: RADIUS.full,
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={[TYPOGRAPHY.bodyMedium, { color: coverageType === 'Home Care' ? '#FFFFFF' : '#1C1C1E' }]}>
                      Home Care
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={[TYPOGRAPHY.caption, { color: '#8E8E93', marginTop: 8, marginBottom: 16 }]}>
                  {coverageTypeDesc}
                </Text>
              </View>

              {/* Start Date + Start Time — ITEM 1 borderRadius 20 */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => {
                    setWatNow(new Date(Date.now() + 60 * 60 * 1000));
                    setShowDatePicker(true);
                  }}
                  style={{ flex: 1, backgroundColor: '#2C2C2E', borderRadius: 22, padding: 14 }}
                >
                  <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', marginBottom: 6 }]}>
                    START DATE
                  </Text>
                  <Text style={[TYPOGRAPHY.body, { color: '#FFFFFF' }]}>
                    {formattedDate}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setWatNow(new Date(Date.now() + 60 * 60 * 1000));
                    setShowStartTimePicker(true);
                  }}
                  style={{ flex: 1, backgroundColor: '#2C2C2E', borderRadius: 22, padding: 14 }}
                >
                  <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', marginBottom: 6 }]}>
                    START TIME
                  </Text>
                  <Text style={[TYPOGRAPHY.body, { color: '#FFFFFF' }]}>
                    {formattedStartTime}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* End Time + Coverage Length — ITEM 1 borderRadius 20 */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => {
                    setWatNow(new Date(Date.now() + 60 * 60 * 1000));
                    setShowEndTimePicker(true);
                  }}
                  style={{ flex: 1, backgroundColor: '#2C2C2E', borderRadius: 22, padding: 14 }}
                >
                  <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', marginBottom: 6 }]}>
                    END TIME
                  </Text>
                  <Text style={[TYPOGRAPHY.body, { color: '#FFFFFF' }]}>
                    {formattedEndTime}
                  </Text>
                </TouchableOpacity>

                {/* Coverage Length — ITEM 1 borderRadius 20, ITEM 5.1 cap at 15 */}
                <View style={{ flex: 1, backgroundColor: '#2C2C2E', borderRadius: 22, padding: 14 }}>
                  <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', marginBottom: 6 }]}>
                    COVERAGE LENGTH
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <TouchableOpacity
                      onPress={() => {
                        const next = Math.max(1, coverageLength - 1);
                        setCoverageLength(next);
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: RADIUS.full,
                        backgroundColor: '#3A3A3C',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 18, color: '#FFFFFF', lineHeight: 22 }}>−</Text>
                    </TouchableOpacity>
                    <Text style={[TYPOGRAPHY.body, { color: '#FFFFFF', minWidth: 50, textAlign: 'center' }]}>
                      {coverageLengthLabel}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (isPlusDisabled) return;
                        const next = Math.min(15, coverageLength + 1);
                        setCoverageLength(next);
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: RADIUS.full,
                        backgroundColor: '#3A3A3C',
                        justifyContent: 'center',
                        alignItems: 'center',
                        opacity: isPlusDisabled ? 0.35 : 1,
                      }}
                      pointerEvents={isPlusDisabled ? 'none' : 'auto'}
                    >
                      <Text style={{ fontSize: 18, color: '#FFFFFF', lineHeight: 22 }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Environment — ITEM 2: wrapped in structured card, hidden for Home Care */}
              {coverageType === 'Standard' && (
              <View style={{
                backgroundColor: '#2C2C2E',
                borderRadius: 22,
                padding: 16,
                marginBottom: 16,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={[TYPOGRAPHY.label, { color: '#8E8E93' }]}>ENVIRONMENT</Text>
                  <View style={{
                    flexDirection: 'row',
                    backgroundColor: '#F9F9F6',
                    borderRadius: RADIUS.full,
                    padding: 4,
                  }}>
                    <TouchableOpacity
                      onPress={() => {
                        setEnvironment('Normal');
                      }}
                      style={{
                        backgroundColor: environment === 'Normal' ? '#1C1C1E' : 'transparent',
                        borderRadius: RADIUS.full,
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={[TYPOGRAPHY.captionMedium, { color: environment === 'Normal' ? '#FFFFFF' : '#1C1C1E' }]}>
                        Normal
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setEnvironment('Busy');
                      }}
                      style={{
                        backgroundColor: environment === 'Busy' ? '#1C1C1E' : 'transparent',
                        borderRadius: RADIUS.full,
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={[TYPOGRAPHY.captionMedium, { color: environment === 'Busy' ? '#FFFFFF' : '#1C1C1E' }]}>
                        Busy
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[TYPOGRAPHY.caption, { color: '#8E8E93' }]}>
                  {environmentDesc}
                </Text>
              </View>
              )}

              {/* Note — ITEM 3: unified container */}
              <View style={{
                backgroundColor: '#2C2C2E',
                borderRadius: 22,
                padding: 16,
                marginBottom: 28,
              }}>
                <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', marginBottom: 8 }]}>
                  NOTE (OPTIONAL)
                </Text>
                <TextInput
                  value={note}
                  onChangeText={(v) => {
                    setNote(v);
                  }}
                  multiline
                  maxLength={80}
                  placeholder="Anything else the doctor should know? (Skills, notes, or tips)..."
                  placeholderTextColor='#6B6B6B'
                  style={[
                    TYPOGRAPHY.body,
                    {
                      minHeight: 80,
                      backgroundColor: 'transparent',
                      textAlignVertical: 'top',
                      color: '#FFFFFF',
                    },
                  ]}
                />
                <Text style={{
                  fontSize: 11,
                  color: note.length >= 72 ? '#E53E3E' : '#6B6B6B',
                  textAlign: 'right',
                  marginTop: 4,
                }}>
                  {note.length}
                  {' / 80'}
                </Text>
              </View>

              {/* Continue button */}
              <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={handleGoToSummary}
                  disabled={continueProcessing}
                  activeOpacity={0.8}
                  style={{
                    width: 160,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: '#F9F9F6',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                    opacity: continueProcessing ? 0.70 : 1,
                  }}
                >
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }}>Continue</Text>
                  <ArrowRight size={18} color="#1C1C1E" />
                </TouchableOpacity>
              </View>
            </ScrollView>
            </KeyboardAvoidingView>
          )}

          {/* SUMMARY */}
          {sheetState === 'summary' && (
            <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24, paddingTop: 8 }}>
              <DragHandle panHandlers={dragPanResponder.panHandlers} />
              <Text style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.4,
                color: COLORS.textSecondary,
                marginBottom: 10,
                marginTop: 8,
              }}>
                COVERAGE
              </Text>
              {previewLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, height: 60 }}>
                  <ActivityIndicator size="small" color="#8E8E93" style={{ marginRight: 10 }} />
                  <Text style={{ fontSize: 28, fontWeight: '800', color: '#8E8E93', letterSpacing: -1 }}>
                    Calculating...
                  </Text>
                </View>
              ) : previewPriceError ? (
                <Text style={{
                  fontSize: 15,
                  fontWeight: '500',
                  color: '#FF453A',
                  lineHeight: 22,
                  marginBottom: 6,
                }}>
                  We couldn't calculate the price. Please check your internet connection and try again.
                </Text>
              ) : (
                <Text style={{
                  fontSize: 52,
                  fontWeight: '800',
                  color: '#FFFFFF',
                  lineHeight: 60,
                  letterSpacing: -1,
                  marginBottom: 6,
                }}>
                  {coveragePriceDisplay}
                </Text>
              )}
              <Text style={{
                fontSize: 15,
                fontWeight: '400',
                color: previewLoading ? '#555' : '#8E8E93',
                marginBottom: 32,
              }}>
                {previewLoading ? '—' : previewPriceError ? '' : coverageSubtitle}
              </Text>
              <TouchableOpacity
                onPress={handleRequestCoverage}
                disabled={submitting || previewPriceError || previewPrice <= 0}
                activeOpacity={0.85}
                style={{
                  backgroundColor: submitting ? '#555' : '#FFFFFF',
                  borderRadius: 28,
                  paddingVertical: 18,
                  alignItems: 'center',
                  width: '100%',
                  opacity: (submitting || previewPriceError || previewPrice <= 0) ? 0.5 : 1,
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#1C1C1E',
                  letterSpacing: 0.2,
                }}>
                  {submitting ? 'Submitting...' : 'Request Coverage'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* MATCHING */}
          {sheetState === 'matching' && (
            <View style={{ padding: 24, paddingBottom: insets.bottom + 16 }}>
              <DragHandle />
              <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', letterSpacing: 1.2, marginBottom: 6 }]}>
                {selectedPlace ? selectedPlace.name.toUpperCase() : 'FACILITY'}
              </Text>
              <Text style={[TYPOGRAPHY.h2, { color: '#FFFFFF', marginBottom: 4 }]}>Finding Medical Officer</Text>
              <Text style={[TYPOGRAPHY.body, { color: '#8E8E93', marginBottom: 24 }]}>Connecting to available doctors nearby</Text>

              {/* Progress bar with A/B labels */}
              <View style={{ width: '100%' }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: '#2C2C2E', width: '100%', overflow: 'hidden' }}>
                  <Animated.View style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: '#2563EB',
                    width: matchProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' }} />
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E' }} />
                </View>
              </View>

              <Text style={[TYPOGRAPHY.caption, { color: '#8E8E93', textAlign: 'center', marginTop: 8, marginBottom: 24 }]}>
                Checking nearby availability...
              </Text>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  onPress={handleEditRequest}
                  style={{ flex: 1, backgroundColor: '#0A0A0A', borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={[TYPOGRAPHY.bodyMedium, { color: '#FFFFFF' }]}>Edit Request</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCancelRequest}
                  style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={[TYPOGRAPHY.bodyMedium, { color: '#1C1C1E' }]}>Cancel Request</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}


        </Animated.View>
      )}

      {/* ── MAP BACKDROP — above the sheet, covers only the map area above it ── */}
      {(sheetState === 'searching' || sheetState === 'config') && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: Animated.subtract(new Animated.Value(SCREEN_HEIGHT), sheetAnim),
          }}
        >
          <Pressable
            onPress={() => { Keyboard.dismiss(); handleReset(); }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}

      {/* ── IDLE BOTTOM CONTAINER (white card only — tab bar is in layout) ── */}
      {sheetState === 'idle' && (
        <>
          {/* Active session — upcoming or paused */}
          {activeSession !== null &&
            (activeSession.status === 'upcoming' || activeSession.status === 'paused') && (
            <RequesterUpcomingCard
              session={activeSession}
              onCancel={handleCancelActiveShift}
              onCall={handleCallDoctor}
              onStartShift={handleStartShift}
              onResumeShift={handleResumeShift}
              onEndShift={handleEndShift}
              bottomPadding={whiteCardPaddingBottom}
              startShiftDisabled={startShiftProcessing}
              resumeShiftDisabled={resumeShiftProcessing}
            />
          )}

          {/* Active session — active */}
          {activeSession !== null && activeSession.status === 'active' && (
            <RequesterActiveCard
              session={activeSession}
              onCall={handleCallDoctor}
              onPauseShift={handlePauseShift}
              onEndShift={handleEndShift}
              bottomPadding={whiteCardPaddingBottom}
            />
          )}

          {/* Active session — payment pending */}
          {activeSession !== null && activeSession.status === 'payment_pending' && (
            <RequesterPaymentCard
              session={activeSession}
              bottomPadding={whiteCardPaddingBottom}
              onPaymentConfirmed={handlePaymentConfirmed}
              initialPayment={(activeSession as any)._initialPayment ?? null}
            />
          )}

          {/* No active session OR unhandled status — show search card */}
          {sessionFetched && (activeSession === null ||
            activeSession.status === 'completed' ||
            activeSession.status === 'cancelled' ||
            activeSession.status === 'requester_paid' ||
            activeSession.status === 'settled' ||
            (activeSession.status !== 'upcoming' &&
             activeSession.status !== 'paused' &&
             activeSession.status !== 'active' &&
             activeSession.status !== 'payment_pending')) && (
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
              {/* White search card */}
              <View style={{
                backgroundColor: '#1C1C1E',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingTop: 16,
                paddingHorizontal: 16,
                paddingBottom: whiteCardPaddingBottom,
                minHeight: 220,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -3 },
                shadowOpacity: 0.08,
                shadowRadius: 10,
                elevation: 10,
              }}>
                {/* Drag handle — swipe up to search */}
                <View
                  {...idleDragResponder.panHandlers}
                  style={{ alignItems: 'center', marginBottom: 16, paddingVertical: 8 }}
                >
                  <View style={{ width: 40, height: 5, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
                </View>
                {/* Search capsule */}
                {isAccountBlocked ? (
                  <View style={{ backgroundColor: '#2C2C2E', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {isSuspended ? (
                        <MaterialCommunityIcons name="account-cancel-outline" size={16} color="#FF3B30" />
                      ) : (
                        <MaterialCommunityIcons name="shield-search" size={16} color="#FF9F0A" />
                      )}
                      <Text style={{ fontSize: 14, fontWeight: '700', color: isSuspended ? '#FF3B30' : '#FF9F0A', fontFamily: 'Inter_700Bold' }}>
                        {isSuspended ? 'Account Suspended' : 'Account Under Review'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: '#8E8E93', fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                      {isSuspended
                        ? 'Your account has been temporarily suspended.\nPlease contact support for assistance.'
                        : 'Your account is being reviewed by FlashLocum administrators.\nYou cannot create new requests at this time.'}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleSearchTap}
                    activeOpacity={0.8}
                    style={{ backgroundColor: '#2C2C2E', borderRadius: 28, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <Search size={18} color="#8E8E93" />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Where is coverage needed?</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </>
      )}

      {/* ── REQUESTER RATING CARD ── */}
      <RequesterRatingCard
        visible={showPaymentSuccess}
        session={confirmedSession}
        amount={settledAmount ?? (confirmedSession as any)?.total_cost ?? confirmedSession?.price ?? 0}
        ratingStars={ratingStars}
        ratingComment={ratingComment}
        ratingError={ratingError}
        submittingRating={submittingRating}
        onDismiss={() => {
          const sid = confirmedSession?.id;
          console.log('[Requester] Rating card dismissed', { sessionId: sid });
          // Record as dismissed so the overlay never re-appears for this session
          if (sid) markRequesterSessionDismissed(sid);
          // Persist dismissal server-side so it survives app reinstalls / new devices
          if (user?.id && sid) {
            void supabase.from('rating_dismissals').insert({
              session_id: sid,
              user_id: user.id,
              reviewer_role: 'requester',
            });
          }
          setShowPaymentSuccess(false);
          setConfirmedSession(null);
          setSettledAmount(null);
          setActiveSession(null);
          setRatingStars(0);
          setRatingComment('');
          setRatingError('');
        }}
        onStarPress={(star) => {
          setRatingStars(star);
          setRatingError('');
        }}
        onCommentChange={(text) => setRatingComment(text)}
        onSubmitRating={async () => {
          if (ratingStars === 0) {
            setRatingError('Please select a star rating');
            return;
          }
          if (!confirmedSession) return;
          console.log('[Requester] Submitting rating', { sessionId: confirmedSession.id, stars: ratingStars });
          setSubmittingRating(true);
          setRatingError('');
          try {
            const res = await fetchWithAuth(`${EDGE_BASE}/submit-review`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: confirmedSession.id, stars: ratingStars, comment: ratingComment || undefined, reviewer_role: 'requester' }),
            });
            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}));
              throw new Error((errBody as any).error || 'Failed to submit review');
            }
            console.log('[Requester] Rating submitted successfully', { sessionId: confirmedSession.id });
            if (confirmedSession?.id) markRequesterSessionPaid(confirmedSession.id);
            setShowPaymentSuccess(false);
            setConfirmedSession(null);
            setSettledAmount(null);
            setActiveSession(null);
            setRatingStars(0);
            setRatingComment('');
            setRatingError('');
          } catch (e: any) {
            console.log('[Requester] Rating submission failed', { error: e.message });
            setRatingError(e.message || 'Failed to submit review');
          } finally {
            setSubmittingRating(false);
          }
        }}
      />

      {/* Date picker — platform split */}
      {Platform.OS === 'android' ? (
        showDatePicker && (
          <DateTimePicker
            value={shiftDate}
            mode="date"
            display="default"
            minimumDate={new Date(Date.now() + 30 * 60 * 1000)}
            maximumDate={maxDate}
            onChange={(event, date) => {
              // Always close first on Android
              setShowDatePicker(false);
              console.log('[DatePicker] Android onChange', event.type, date);
              if (event.type === 'dismissed' || !date) return;
              // WAT validation: snap back to today if before WAT today
              const watTodayStr = watNow.toISOString().split('T')[0];
              const selectedStr = date.toISOString().split('T')[0];
              if (selectedStr < watTodayStr) {
                const todayWAT = new Date(watNow);
                todayWAT.setUTCHours(0, 0, 0, 0);
                setShiftDate(todayWAT);
                setStartTime(prev => {
                  const updated = new Date(todayWAT);
                  updated.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
                  return updated;
                });
                setEndTime(prev => {
                  const updated = new Date(todayWAT);
                  updated.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
                  return updated;
                });
              } else {
                setShiftDate(date);
                setStartTime(prev => {
                  const updated = new Date(date);
                  updated.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
                  return updated;
                });
                setEndTime(prev => {
                  const updated = new Date(date);
                  updated.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
                  return updated;
                });
              }
            }}
          />
        )
      ) : (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
              <Pressable onPress={e => e.stopPropagation()}>
                <View style={{ backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 12 }}>
                    <TouchableOpacity onPress={() => {
                      console.log('[DatePicker] Done button pressed');
                      setShowDatePicker(false);
                    }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={shiftDate}
                    mode="date"
                    display="spinner"
                    minimumDate={new Date(Date.now() + 30 * 60 * 1000)}
                    maximumDate={maxDate}
                    style={{ backgroundColor: '#1C1C1E' }}
                    textColor="#FFFFFF"
                    onChange={(event, date) => {
                      console.log('[DatePicker] iOS onChange', event.type, date);
                      if (event.type === 'dismissed') {
                        setShowDatePicker(false);
                        return;
                      }
                      if (date) {
                        // WAT validation: snap back to today if before WAT today
                        const watTodayStr = watNow.toISOString().split('T')[0];
                        const selectedStr = date.toISOString().split('T')[0];
                        if (selectedStr < watTodayStr) {
                          const todayWAT = new Date(watNow);
                          todayWAT.setUTCHours(0, 0, 0, 0);
                          setShiftDate(todayWAT);
                          setStartTime(prev => {
                            const updated = new Date(todayWAT);
                            updated.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
                            return updated;
                          });
                          setEndTime(prev => {
                            const updated = new Date(todayWAT);
                            updated.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
                            return updated;
                          });
                        } else {
                          setShiftDate(date);
                          setStartTime(prev => {
                            const updated = new Date(date);
                            updated.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
                            return updated;
                          });
                          setEndTime(prev => {
                            const updated = new Date(date);
                            updated.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
                            return updated;
                          });
                        }
                      }
                    }}
                  />
                </View>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Start time picker modal — ITEM 4: custom picker */}
      <CustomTimePicker
        visible={showStartTimePicker}
        initialTime={startTime}
        isForDate={shiftDate}
        shiftDate={shiftDate}
        onDone={(date) => {
          setStartTime(date);
          setShowStartTimePicker(false);
        }}
        onCancel={() => {
          setShowStartTimePicker(false);
        }}
      />

      {/* End time picker modal — ITEM 4: custom picker */}
      <CustomTimePicker
        visible={showEndTimePicker}
        initialTime={endTime}
        isForDate={shiftDate}
        shiftDate={shiftDate}
        isEndTime={true}
        onDone={(date) => {
          setEndTime(date);
          setShowEndTimePicker(false);
        }}
        onCancel={() => {
          setShowEndTimePicker(false);
        }}
      />

      {/* ── NO DOCTOR ACCEPTED MODAL ── */}
      <Modal
        visible={showExpiredModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
          onPress={() => {}}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{
              backgroundColor: '#1C1C1E',
              borderRadius: 24,
              padding: 28,
              width: '100%',
            }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' }}>
                No Doctor Accepted
              </Text>
              <Text style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
                No Medical Officer accepted your request this time. You can adjust your request or offer and try again.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowExpiredModal(false);
                  handleEditRequest();
                }}
                style={{
                  backgroundColor: '#F9F9F6',
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1C1C1E' }}>Modify Request</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowExpiredModal(false);
                  setActiveRequestId(null);
                  transitionTo('idle');
                }}
                style={{
                  backgroundColor: '#2C2C2E',
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Back to Home</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── CANCEL CONFIRMATION MODAL ── */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={handleWaitForDoctor}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
          onPress={handleWaitForDoctor}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{
              backgroundColor: '#1C1C1E',
              borderRadius: 24,
              padding: 28,
              width: '100%',
            }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' }}>
                Cancel Request?
              </Text>
              <Text style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
                Doctors are currently being notified. Staying online gives you the best chance of being matched quickly.
              </Text>
              <TouchableOpacity
                onPress={handleWaitForDoctor}
                style={{
                  backgroundColor: '#F9F9F6',
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1C1C1E' }}>Wait for Doctor</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmCancel}
                style={{
                  backgroundColor: '#2C2C2E',
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#FF3B30' }}>Cancel Request</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── EARLY START TIME MODAL ── */}
      <Modal
        visible={showEarlyStartModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEarlyStartModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
          onPress={() => setShowEarlyStartModal(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{
              backgroundColor: '#1C1C1E',
              borderRadius: 24,
              padding: 28,
              width: '100%',
            }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' }}>
                Choose a Later Start Time
              </Text>
              <Text style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
                Start time must be at least 30 minutes from now.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  console.log('[EarlyStartModal] Update Start Time pressed');
                  setShowEarlyStartModal(false);
                  transitionTo('config');
                }}
                style={{
                  backgroundColor: '#F9F9F6',
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1C1C1E' }}>Update Start Time</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── CANCELLATION REASON MODAL ── */}
      <Modal
        visible={showCancelReasons}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCancelReasons(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: '#1C1C1E',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 12,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 24,
          }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 4, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 }}>
              Reason for Cancellation
            </Text>
            <Text style={{ fontSize: 14, color: '#8E8E93', marginBottom: 24 }}>
              Help us improve by letting us know why you cancelled.
            </Text>
            {[
              'Found a doctor elsewhere',
              'No longer needed',
              'Wrong details entered',
              'Taking too long',
              'Other',
            ].map((reason) => (
              <TouchableOpacity
                key={reason}
                onPress={() => handleCancelReasonSelected(reason)}
                style={{
                  backgroundColor: '#2C2C2E',
                  borderRadius: 16,
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  marginBottom: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ fontSize: 15, color: '#FFFFFF', fontWeight: '500' }}>{reason}</Text>
                <Text style={{ fontSize: 18, color: '#8E8E93' }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── CANCEL ACTIVE SHIFT CONFIRMATION MODAL ── */}
      <Modal
        visible={showCancelActiveModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelActiveModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
          onPress={() => setShowCancelActiveModal(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: '#1C1C1E', borderRadius: 24, padding: 28, width: '100%' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' }}>
                Cancel Shift?
              </Text>
              <Text style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
                A doctor has already accepted this shift. Cancelling will affect your reliability score.
              </Text>
              <TouchableOpacity
                onPress={() => setShowCancelActiveModal(false)}
                style={{ backgroundColor: '#F9F9F6', borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1C1C1E' }}>Keep Shift</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmCancelActive}
                style={{ backgroundColor: '#2C2C2E', borderRadius: 999, paddingVertical: 16, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#FF3B30' }}>Cancel Shift</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── CANCEL ACTIVE SHIFT REASON MODAL ── */}
      <Modal
        visible={showCancelActiveReasons}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCancelActiveReasons(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#1C1C1E', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 4, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 }}>
              Reason for Cancellation
            </Text>
            <Text style={{ fontSize: 14, color: '#8E8E93', marginBottom: 24 }}>
              Help us improve by letting us know why you cancelled.
            </Text>
            {['Found a doctor elsewhere', 'No longer needed', 'Emergency', 'Wrong details entered', 'Other'].map((reason) => (
              <TouchableOpacity
                key={reason}
                onPress={() => handleCancelActiveReasonSelected(reason)}
                disabled={cancelShiftProcessing}
                activeOpacity={0.8}
                style={{ backgroundColor: '#2C2C2E', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: cancelShiftProcessing ? 0.70 : 1 }}
              >
                <Text style={{ fontSize: 15, color: '#FFFFFF', fontWeight: '500' }}>{reason}</Text>
                <Text style={{ fontSize: 18, color: '#8E8E93' }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── END SHIFT CONFIRMATION MODAL ── */}
      <Modal
        visible={showEndShiftModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEndShiftModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
          onPress={() => setShowEndShiftModal(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: '#1C1C1E', borderRadius: 24, padding: 28, width: '100%' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' }}>
                End Shift?
              </Text>
              <Text style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
                This will close the entire booking and trigger the payment process.
              </Text>
              <TouchableOpacity
                onPress={() => setShowEndShiftModal(false)}
                style={{ backgroundColor: '#F9F9F6', borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1C1C1E' }}>Continue Shift</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmEndShift}
                disabled={endShiftProcessing}
                activeOpacity={0.8}
                style={{ backgroundColor: '#2C2C2E', borderRadius: 999, paddingVertical: 16, alignItems: 'center', opacity: endShiftProcessing ? 0.70 : 1 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#FF3B30' }}>End Shift</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── PAUSE SHIFT CONFIRMATION MODAL ── */}
      <Modal
        visible={showPauseShiftModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPauseShiftModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
          onPress={() => setShowPauseShiftModal(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: '#1C1C1E', borderRadius: 24, padding: 28, width: '100%' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' }}>
                Pause Shift?
              </Text>
              <Text style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
                This marks the daily session as complete. You can resume it at any time.
              </Text>
              <TouchableOpacity
                onPress={() => setShowPauseShiftModal(false)}
                style={{ backgroundColor: '#F9F9F6', borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1C1C1E' }}>Keep Going</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmPauseShift}
                disabled={pauseShiftProcessing}
                activeOpacity={0.8}
                style={{ backgroundColor: '#2C2C2E', borderRadius: 999, paddingVertical: 16, alignItems: 'center', opacity: pauseShiftProcessing ? 0.70 : 1 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#FF9500' }}>Pause Shift</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── TOOLTIP MODAL ── */}
      <Modal
        visible={tooltipVisible !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTooltipVisible(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}
          onPress={() => { console.log('[Requester] Tooltip modal backdrop pressed, closing'); setTooltipVisible(null); }}
        >
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={{ backgroundColor: '#1C1C1E', borderRadius: 20, padding: 24, width: '100%' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 10 }}>
                {tooltipVisible === 'rating' ? 'Ratings' : 'Reliability'}
              </Text>
              <Text style={{ fontSize: 14, color: '#EBEBF5CC', lineHeight: 20 }}>
                {tooltipVisible === 'rating'
                  ? 'Reflects how satisfied doctors are with your work environment. Minimum: 3.5 stars.'
                  : 'Frequently cancelling accepted shifts may reduce your reliability score. Minimum: 75%'}
              </Text>
              <TouchableOpacity
                onPress={() => { console.log('[Requester] Tooltip "Got it" pressed:', tooltipVisible); setTooltipVisible(null); }}
                style={{ marginTop: 20, backgroundColor: '#3A3A3C', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Got it</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
    </ErrorBoundary>
  );
}

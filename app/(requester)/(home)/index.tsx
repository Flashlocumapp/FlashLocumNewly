import React, { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Search, MapPin, ArrowRight, X, History, ArrowLeft } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { useTabBarVisibility, TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';
import { useAuth } from '@/contexts/AuthContext';
import type { CoverageSession } from '@/contexts/DoctorDispatchContext';
import { getCached, setCached } from '@/utils/tabCache';

const EDGE_BASE = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1';

// ─── Persistent deduplication for payment success modal ──────────────────────
const REQUESTER_PAID_SESSIONS_KEY = 'requester_paid_sessions_v1';
// Layer 1: synchronous in-memory Set — blocks concurrent triggers instantly
const _requesterPaidSessions = new Set<string>();
// Layer 2: in-flight lock — prevents two async checks racing each other
const _requesterRatingInFlight = new Set<string>();

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
    const existing = await AsyncStorage.getItem(REQUESTER_PAID_SESSIONS_KEY);
    const arr: string[] = existing ? JSON.parse(existing) : [];
    arr.forEach(id => _requesterPaidSessions.add(id));
  } catch {}
}

// Module-level flag — survives tab switches / screen remounts
let _hasInitialFix = false;
// Module-level coord cache — survives tab switches (screen remounts)
let _cachedRequesterCoords: { latitude: number; longitude: number } | null = null;
// Module-level session cache — survives tab switches / screen remounts
let _cachedActiveSession: CoverageSession | null = undefined as any; // undefined = never fetched, null = fetched but no session
let _sessionCachePopulated = false;

const ANDROID_KEY = 'AIzaSyACeTm0j_ajj-rRObPbkDBJvW6GVBt6SMU';
const IOS_KEY = 'AIzaSyBFC2FPkzjooOJhFwkMsM_o3qQiTOn0rZk';
const MAPS_KEY = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;

const RECENT_PLACE_KEY = 'flashlocum_recent_place';

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const LAGOS_BOUNDS = {
  northeast: { lat: 6.7027, lng: 3.7042 },
  southwest: { lat: 6.3933, lng: 2.7076 },
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SHEET_HEIGHTS = {
  idle: 140 + 80,
  searching: SCREEN_HEIGHT * 0.62,
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
  { elementType: 'geometry', stylers: [{ color: '#dde0e3' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#cfd2d5' }] },
  { featureType: 'poi.park', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#cdd0d4' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#c4c8cc' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#a8c4d8' }] },
  { featureType: 'water', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
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
  watNow,
}: {
  visible: boolean;
  initialTime: Date;
  onDone: (date: Date) => void;
  onCancel: () => void;
  isForDate: Date;
  shiftDate: Date;
  watNow: Date;
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
    // WAT validation
    const shiftDateStr = shiftDate.toISOString().split('T')[0];
    const watTodayStr = watNow.toISOString().split('T')[0];
    if (shiftDateStr === watTodayStr) {
      const watHour = watNow.getUTCHours();
      const watMinute = watNow.getUTCMinutes();
      if (h24 < watHour || (h24 === watHour && selectedMinute <= watMinute)) {
        Alert.alert('Invalid Time', 'Please select a future time.');
        return;
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

function buildShiftPillText(session: CoverageSession): string {
  const shiftMs = new Date(session.shift_end).getTime() - new Date(session.shift_start).getTime();
  const msHours = shiftMs / (1000 * 60 * 60);
  const perDayHours = (session.per_day_hours && Number(session.per_day_hours) > 0)
    ? Number(session.per_day_hours)
    : (msHours > 0 ? msHours : 24);
  const coverageLength = Math.max(1, session.coverage_length ?? 1);
  const totalHours = perDayHours * coverageLength;
  const hoursDisplay = totalHours % 1 === 0 ? `${totalHours}hr` : `${totalHours.toFixed(1)}hr`;
  const priceDisplay = `₦${Number(session.price).toLocaleString()}`;
  const shiftStart = formatSessionTime(session.shift_start);
  const shiftEnd = formatSessionTime(session.shift_end);
  const sep = ' · ';

  if (session.status === 'paused') {
    return `${session.shift_type}${sep}Day ${session.current_day} of ${coverageLength}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
  }

  if (perDayHours >= 24) {
    const startDate = new Date(session.shift_date + 'T12:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    const startDay = startDate.toLocaleDateString('en-US', { weekday: 'short' });
    const endDay = endDate.toLocaleDateString('en-US', { weekday: 'short' });
    return `${session.shift_type}${sep}${startDay} - ${endDay}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
  }

  if (coverageLength > 1) {
    const startDate = new Date(session.shift_date + 'T12:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + coverageLength - 1);
    const startDay = startDate.toLocaleDateString('en-US', { weekday: 'short' });
    const endDay = endDate.toLocaleDateString('en-US', { weekday: 'short' });
    return `${session.shift_type}${sep}${startDay} - ${endDay}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}${sep}Day ${session.current_day} of ${coverageLength}`;
  }

  const dayLabel = new Date(session.shift_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  return `${session.shift_type}${sep}${dayLabel}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
}

function SessionEnvBadge({ environment }: { environment: string }) {
  const bg = '#F5F5F0';
  const color = '#1C1C1E';
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontSize: 12, color, fontFamily: 'Inter_600SemiBold' }}>{environment}</Text>
    </View>
  );
}

// ─── Requester Upcoming Coverage Card ────────────────────────────────────────
function RequesterUpcomingCard({
  session,
  onCancel,
  onCall,
  onStartShift,
  onResumeShift,
  onEndShift,
  bottomPadding,
}: {
  session: CoverageSession;
  onCancel: () => void;
  onCall: () => void;
  onStartShift: () => void;
  onResumeShift: () => void;
  onEndShift: () => void;
  bottomPadding: number;
}) {
  const isPaused = session.status === 'paused';
  const canCancel = session.status === 'upcoming' && session.current_day === 1;
  const shiftPillText = buildShiftPillText(session);
  const rawDoctorName = session.doctor_name || '';
  // Strip any existing Dr. prefix then re-apply exactly once
  const cleanName = rawDoctorName.replace(/^dr\.?\s*/i, '').trim();
  const doctorName = cleanName && !cleanName.includes('@') ? `Dr. ${cleanName}` : 'Doctor';
  const initials = cleanName ? getSessionInitials(cleanName) : 'DR';

  const [liveRating, setLiveRating] = useState<number | null>(null);
  const [liveReliability, setLiveReliability] = useState<number | null>(null);

  useEffect(() => {
    if (!session.doctor_id) return;
    console.log('[Requester Home] Fetching live doctor stats for doctor_id:', session.doctor_id);
    supabase
      .from('doctor_profiles')
      .select('rating, reliability_score')
      .eq('id', session.doctor_id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.log('[Requester Home] Doctor stats fetch failed (upcoming), using defaults:', error?.message);
          setLiveRating(5.0);
          setLiveReliability(100);
        } else {
          console.log('[Requester Home] Live doctor stats fetched (upcoming):', data);
          setLiveRating(data.rating ?? 5.0);
          setLiveReliability(data.reliability_score ?? 100);
        }
      });
  }, [session.doctor_id]);

  const ratingDisplay = liveRating != null ? liveRating.toFixed(1) : '--';
  const reliabilityDisplay = liveReliability != null ? `${Math.round(liveReliability)}` : '--';

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
      <View style={{ backgroundColor: '#2C2C2E', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 14 }}>
        <Text style={{ fontSize: 12, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }} numberOfLines={1}>{shiftPillText}</Text>
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
            style={{ flex: 1, backgroundColor: '#34C759', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
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
            style={{ flex: 1, backgroundColor: '#34C759', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
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

  const [liveRatingActive, setLiveRatingActive] = useState<number | null>(null);
  const [liveReliabilityActive, setLiveReliabilityActive] = useState<number | null>(null);

  useEffect(() => {
    if (!session.doctor_id) return;
    console.log('[Requester Home] Fetching live doctor stats for active session, doctor_id:', session.doctor_id);
    supabase
      .from('doctor_profiles')
      .select('rating, reliability_score')
      .eq('id', session.doctor_id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.log('[Requester Home] Doctor stats fetch failed (active), using defaults:', error?.message);
          setLiveRatingActive(5.0);
          setLiveReliabilityActive(100);
        } else {
          console.log('[Requester Home] Live doctor stats fetched (active):', data);
          setLiveRatingActive(data.rating ?? 5.0);
          setLiveReliabilityActive(data.reliability_score ?? 100);
        }
      });
  }, [session.doctor_id]);

  const ratingDisplay = liveRatingActive != null ? liveRatingActive.toFixed(1) : '--';
  const reliabilityDisplay = liveReliabilityActive != null ? `${Math.round(liveReliabilityActive)}` : '--';
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
      <View style={{ backgroundColor: '#2C2C2E', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 10 }}>
        <Text style={{ fontSize: 12, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }} numberOfLines={1}>{shiftPillText}</Text>
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
        {showPauseButton && (
          <TouchableOpacity onPress={() => { onPauseShift(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }}>PAUSE SHIFT</Text>
          </TouchableOpacity>
        )}
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
      </View>
    </View>
  );
}

// ─── Payment Screen ───────────────────────────────────────────────────────────
function RequesterPaymentCard({
  session,
  bottomPadding,
  onPaymentConfirmed,
}: {
  session: CoverageSession;
  bottomPadding: number;
  onPaymentConfirmed: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Payment intent state — always sourced from backend
  const [paymentIntent, setPaymentIntent] = useState<import('@/types').PaymentIntent | null>(null);
  const paymentIntentRef = useRef<import('@/types').PaymentIntent | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  // paymentConfirmed is now driven entirely by the parent via onPaymentConfirmed

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

  // ─── Fetch payment intent from Supabase ──────────────────────────────────
  const fetchPaymentIntent = useCallback(async () => {
    setLoadingIntent(true);
    try {
      const { data, error } = await supabase
        .from('payment_intents')
        .select('*')
        .eq('session_id', session.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        setPaymentIntent(null);
      } else if (data) {
        setPaymentIntent(data as import('@/types').PaymentIntent);
        startCountdown(data.expiry_at);
      }
    } catch (e: any) {
    } finally {
      setLoadingIntent(false);
    }
  }, [session.id, startCountdown]);

  // ─── Refresh payment via edge function ───────────────────────────────────
  const handleRefreshPayment = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetchWithAuth('https://juilousufwlsiqdcgllu.supabase.co/functions/v1/refresh-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return;
      }
      const data = await res.json();
      const payment = data?.payment;
      if (payment) {
        const snap = paymentIntentRef.current;
        setPaymentIntent(snap ? {
          ...snap,
          id: payment.id ?? snap.id,
          amount_naira: payment.amount_naira ?? snap.amount_naira,
          monnify_account_number: payment.account_number ?? snap.monnify_account_number,
          monnify_bank_name: payment.bank_name ?? snap.monnify_bank_name,
          monnify_account_reference: payment.account_reference ?? snap.monnify_account_reference,
          expiry_at: payment.expiry_at ?? snap.expiry_at,
        } : snap);
        if (payment.expiry_at) {
          startCountdown(payment.expiry_at);
        }
      }
    } catch (e: any) {
    } finally {
      setRefreshing(false);
    }
  }, [session.id, refreshing, startCountdown]);

  // Keep paymentIntentRef in sync so updaters can read the latest value without stale closures.
  useEffect(() => { paymentIntentRef.current = paymentIntent; }, [paymentIntent]);

  // Keep ref in sync with latest handleRefreshPayment so startCountdown's tick
  // always calls the version that has the current paymentIntent in scope.
  useEffect(() => {
    handleRefreshPaymentRef.current = handleRefreshPayment;
  }, [handleRefreshPayment]);

  // ─── On mount: fetch intent + AppState foreground re-fetch ───────────────
  useEffect(() => {
    fetchPaymentIntent();

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        fetchPaymentIntent();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      sub.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchPaymentIntent]);

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
          rawStatus === 'disbursed' ||
          rawStatus === 'payment_complete'
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
          setPaymentIntent(snap ? {
            ...snap,
            id: payment.id ?? snap.id,
            amount_naira: payment.amount_naira ?? snap.amount_naira,
            monnify_account_number: payment.account_number ?? snap.monnify_account_number,
            monnify_bank_name: payment.bank_name ?? snap.monnify_bank_name,
            monnify_account_reference: payment.account_reference ?? snap.monnify_account_reference,
            expiry_at: payment.expiry_at ?? snap.expiry_at,
          } : snap);
          if (payment.expiry_at) {
            startCountdown(payment.expiry_at);
          }
        }
      })
      .subscribe((status) => {
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [session.id, startCountdown]);

  // ─── Derived display values ───────────────────────────────────────────────
  const amountNaira = paymentIntent?.amount_naira ?? session.price;
  const amountDisplay = `₦${Number(amountNaira).toLocaleString()}`;
  const hasAccountDetails = !!(paymentIntent?.monnify_account_number);
  const accountNumber = paymentIntent?.monnify_account_number ?? '';
  const bankName = paymentIntent?.monnify_bank_name ?? '';
  const copyLabel = copied ? 'Copied!' : 'Copy';

  const countdownDisplay = refreshing ? 'Refreshing...' : countdown;
  const isLoading = loadingIntent && !paymentIntent;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
              {loadingIntent ? 'Loading...' : (bankName || '—')}
            </Text>

            <View style={{ height: 1, backgroundColor: '#F2F2F7', marginBottom: 16 }} />

            {/* Account Number Row */}
            <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold', marginBottom: 6 }}>
              ACCOUNT NUMBER
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 28, fontFamily: 'Inter_700Bold', color: loadingIntent ? '#8E8E93' : '#000000', letterSpacing: 1 }}>
                {loadingIntent ? '— — — —' : (accountNumber || '— — — —')}
              </Text>
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

            <View style={{ height: 1, backgroundColor: '#F2F2F7', marginBottom: 16 }} />

            {/* Account Name Row */}
            <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold', marginBottom: 6 }}>
              ACCOUNT NAME
            </Text>
            <Text style={{ fontSize: 17, fontFamily: 'Inter_600SemiBold', color: loadingIntent ? '#8E8E93' : '#000000' }}>
              {loadingIntent ? 'Loading...' : 'FlashLocum'}
            </Text>
          </View>

          {/* Countdown Card */}
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
                PRICE HELD FOR
              </Text>
              <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', lineHeight: 18 }}>
                Amount may increase if payment isn't made in time.
              </Text>
            </View>
            <Text style={{ fontSize: 28, fontFamily: 'Inter_700Bold', color: countdownColor, letterSpacing: 0.5 }}>
              {countdownDisplay}
            </Text>
          </View>

          {/* Footer Note */}
          <Text style={{
            fontSize: 13,
            color: '#8E8E93',
            fontFamily: 'Inter_400Regular',
            lineHeight: 20,
            textAlign: 'center',
          }}>
            Send the exact amount above from any Nigerian bank app. This page updates automatically once payment is received.
          </Text>
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

  const doctorName = session.doctor_name ?? 'the doctor';
  const displayAmount = amount > 0 ? amount : (session.price ?? 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={{ backgroundColor: '#2C2C2E', borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 }}>
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
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function RequesterHomeScreen() {
  const insets = useSafeAreaInsets();
  const { setTabBarVisible } = useTabBarVisibility();
  const { user } = useAuth();

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
    const ch = supabase.channel(`requester-user:${user.id}`)
      // From channel 3 (scores)
      .on('broadcast', { event: 'RATING_UPDATED' }, (payload) => {
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
        const newReliability = payload?.payload?.new_reliability;
        if (newReliability !== undefined) {
          setRequesterReliability(newReliability);
          const prev = getCached<{ rating: number; reliability: number }>('requester_scores');
          setCached('requester_scores', { rating: prev?.rating ?? 5.0, reliability: newReliability });
        }
      })
      // From channel 6 (payment confirmed on user channel)
      .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
        console.log('[Requester] user channel payment_confirmed received', payload?.payload);
        const sessionId = payload?.payload?.session_id;
        // Capture current session synchronously via ref
        const currentSession = activeSessionRef.current;
        const sid = sessionId ?? currentSession?.id;
        // Update status synchronously
        setActiveSession((prev) => prev ? { ...prev, status: 'requester_paid' } : prev);
        // Run async check OUTSIDE the updater
        if (sid && currentSession && !_requesterPaidSessions.has(sid) && !_requesterRatingInFlight.has(sid)) {
          _requesterRatingInFlight.add(sid);
          isRequesterSessionPaid(sid).then((alreadyHandled) => {
            _requesterRatingInFlight.delete(sid);
            if (!alreadyHandled) {
              setConfirmedSession(currentSession);
              setShowPaymentSuccess(true);
            }
          }).catch(() => { _requesterRatingInFlight.delete(sid); });
        }
        fetchActiveSession();
      })
      .on('broadcast', { event: 'PAYMENT_CONFIRMED' }, (payload) => {
        console.log('[Requester] user channel PAYMENT_CONFIRMED received', payload?.payload);
        const sessionId = payload?.payload?.session_id;
        // Capture current session synchronously via ref
        const currentSession = activeSessionRef.current;
        const sid = sessionId ?? currentSession?.id;
        // Update status synchronously
        setActiveSession((prev) => prev ? { ...prev, status: 'requester_paid' } : prev);
        // Run async check OUTSIDE the updater
        if (sid && currentSession && !_requesterPaidSessions.has(sid) && !_requesterRatingInFlight.has(sid)) {
          _requesterRatingInFlight.add(sid);
          isRequesterSessionPaid(sid).then((alreadyHandled) => {
            _requesterRatingInFlight.delete(sid);
            if (!alreadyHandled) {
              setConfirmedSession(currentSession);
              setShowPaymentSuccess(true);
            }
          }).catch(() => { _requesterRatingInFlight.delete(sid); });
        }
        fetchActiveSession();
      })
      // From channel 7 (shift cancelled on requester channel)
      .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
        setActiveSession(null);
      })
      .subscribe((status) => {
      });
    return () => { supabase.removeChannel(ch); };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapRef = useRef<MapView>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(
    _cachedRequesterCoords
  );
  const [onlineDoctors, setOnlineDoctors] = useState<{ id: string; lat: number; lng: number }[]>([]);

  const locationSub = useRef<Location.LocationSubscription | null>(null);

  const fetchOnlineDoctors = useCallback(async () => {
    const { data, error } = await supabase
      .from('doctor_profiles')
      .select('id, lat, lng')
      .eq('is_online', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null);
    if (error) {
      return;
    }
    setOnlineDoctors((data ?? []) as { id: string; lat: number; lng: number }[]);
  }, [user]);

  // ── Online doctors realtime ──
  useEffect(() => {
    if (!user) return;

    fetchOnlineDoctors();

    const ch = supabase
      .channel('online-doctors')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'doctor_profiles' },
        (payload) => {
          const row = payload.new as { id?: string; lat?: number; lng?: number; is_online?: boolean } | null;
          const doctorId = row?.id ?? (payload.old as any)?.id;
          if (!doctorId) return;

          // If we have a complete row, handle it directly
          if (row && row.id && row.is_online !== undefined && (row.lat !== undefined || row.lng !== undefined)) {
            if (row.is_online && row.lat != null && row.lng != null) {
              setOnlineDoctors((prev) => {
                const filtered = prev.filter((d) => d.id !== row.id);
                return [...filtered, { id: row.id!, lat: row.lat!, lng: row.lng! }];
              });
            } else {
              setOnlineDoctors((prev) => prev.filter((d) => d.id !== doctorId));
            }
            return;
          }

          // Partial row — re-fetch this doctor's full current state
          supabase
            .from('doctor_profiles')
            .select('id, lat, lng, is_online')
            .eq('id', doctorId)
            .single()
            .then(({ data }) => {
              if (!data) {
                setOnlineDoctors((prev) => prev.filter((d) => d.id !== doctorId));
                return;
              }
              if (data.is_online && data.lat != null && data.lng != null) {
                setOnlineDoctors((prev) => {
                  const filtered = prev.filter((d) => d.id !== data.id);
                  return [...filtered, { id: data.id, lat: data.lat!, lng: data.lng! }];
                });
              } else {
                setOnlineDoctors((prev) => prev.filter((d) => d.id !== data.id));
              }
            });
        }
      )
      .subscribe((status) => {
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchOnlineDoctors, user]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WAT now state
  const [watNow, setWatNow] = useState<Date>(() => new Date(Date.now() + 60 * 60 * 1000));

  // Date/time pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // Matching progress
  const matchProgressAnim = useRef(new Animated.Value(0.05)).current;
  const [submitting, setSubmitting] = useState(false);

  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  // Active session state
  const [activeSession, setActiveSession] = useState<CoverageSession | null>(
    _sessionCachePopulated ? _cachedActiveSession : null
  );
  const activeSessionRef = useRef<CoverageSession | null>(null);
  const isFirstLoadRef = useRef(true);
  const [sessionLoading, setSessionLoading] = useState(false); // kept for any remaining uses but never set true again after first load
  const [sessionFetched, setSessionFetched] = useState(_sessionCachePopulated);
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
  const isRealtimeHealthyRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const fetchActiveSessionRef = useRef<() => void>(() => {});
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const transitionToRef = useRef<(state: SheetState) => void>(() => {});



  // ─── Load recent place on mount ───────────────────────────────────────────────
  useEffect(() => {
    SecureStore.getItemAsync(RECENT_PLACE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as SelectedPlace;
          setRecentPlace(parsed);
        } catch {
        }
      }
    });
  }, []);

  // ─── Fetch active session helper ──────────────────────────────────────────────
  const fetchActiveSession = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${EDGE_BASE}/get-active-session?role=requester`, {});
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return;
      }
      const data = await res.json();
      const session: CoverageSession | null = data?.session ?? null;
      setActiveSession(session);
      _cachedActiveSession = session;
      _sessionCachePopulated = true;
      // If session is already paid, use persistent guard to decide whether to show modal
      if (session && session.status === 'requester_paid') {
        // Synchronous check first — avoids async gap
        if (_requesterPaidSessions.has(session.id) || _requesterRatingInFlight.has(session.id)) {
        } else {
          _requesterRatingInFlight.add(session.id);
          // Check AsyncStorage first
          const alreadyHandled = await isRequesterSessionPaid(session.id);
          if (alreadyHandled) {
            _requesterRatingInFlight.delete(session.id);
          } else {
            // Check DB — ultimate source of truth
            try {
              const { data: existingReview } = await supabase
                .from('shift_reviews')
                .select('id')
                .eq('session_id', session.id)
                .eq('reviewer_role', 'requester')
                .maybeSingle();
              if (existingReview) {
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
    } catch (e: any) {
    } finally {
      isFirstLoadRef.current = false;
      setSessionFetched(true); // mark that at least one fetch has completed
      setSessionLoading(false);
    }
  }, []);

  // ─── Keep activeSessionId in sync — only set, never clear ───────────────────
  useEffect(() => {
    if (activeSession?.id) {
      setActiveSessionId(activeSession.id);
    }
    // Intentionally do NOT clear when activeSession becomes null —
    // this keeps the session channel alive after payment_confirmed fires.
  }, [activeSession?.id]);

  // ─── On mount — restore session state ────────────────────────────────────────
  useEffect(() => {
    warmRequesterPaidCache();
    fetchActiveSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Re-fetch on SIGNED_IN (handles login after logout) ──────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        console.log('[RequesterHome] SIGNED_IN — re-fetching active session');
        fetchActiveSession();
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
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        fetchActiveSession();
        fetchOnlineDoctors();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [fetchActiveSession, fetchOnlineDoctors]);

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
      .on('broadcast', { event: 'SHIFT_STARTED' }, (payload) => {
        const updated = payload?.payload?.session as Partial<CoverageSession>;
        setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
      })
      .on('broadcast', { event: 'SHIFT_PAUSED' }, (payload) => {
        const updated = payload?.payload?.session as Partial<CoverageSession>;
        setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
      })
      .on('broadcast', { event: 'SHIFT_RESUMED' }, (payload) => {
        const updated = payload?.payload?.session as Partial<CoverageSession>;
        setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
      })
      .on('broadcast', { event: 'SHIFT_ENDED' }, (payload) => {
        const updated = payload?.payload?.session as Partial<CoverageSession>;
        setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
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
        console.log('[Requester] session channel PAYMENT_CONFIRMED received', payload?.payload);
        const sessionId = payload?.payload?.session_id;
        // Capture current session synchronously via ref
        const currentSession = activeSessionRef.current;
        const sid = sessionId ?? currentSession?.id;
        // Update status synchronously
        setActiveSession((prev) => prev ? { ...prev, status: 'requester_paid' } : prev);
        // Run async check OUTSIDE the updater
        if (sid && currentSession && !_requesterPaidSessions.has(sid) && !_requesterRatingInFlight.has(sid)) {
          _requesterRatingInFlight.add(sid);
          isRequesterSessionPaid(sid).then((alreadyHandled) => {
            _requesterRatingInFlight.delete(sid);
            if (!alreadyHandled) {
              setConfirmedSession(currentSession);
              setShowPaymentSuccess(true);
            }
          }).catch(() => { _requesterRatingInFlight.delete(sid); });
        }
        fetchActiveSession();
      })
      .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
        console.log('[Requester] session channel payment_confirmed received', payload?.payload);
        const sessionId = payload?.payload?.session_id;
        // Capture current session synchronously via ref
        const currentSession = activeSessionRef.current;
        const sid = sessionId ?? currentSession?.id;
        // Update status synchronously
        setActiveSession((prev) => prev ? { ...prev, status: 'requester_paid' } : prev);
        // Run async check OUTSIDE the updater
        if (sid && currentSession && !_requesterPaidSessions.has(sid) && !_requesterRatingInFlight.has(sid)) {
          _requesterRatingInFlight.add(sid);
          isRequesterSessionPaid(sid).then((alreadyHandled) => {
            _requesterRatingInFlight.delete(sid);
            if (!alreadyHandled) {
              setConfirmedSession(currentSession);
              setShowPaymentSuccess(true);
            }
          }).catch(() => { _requesterRatingInFlight.delete(sid); });
        }
        fetchActiveSession();
      })
      .on('broadcast', { event: 'PAYMENT_COMPLETE' }, (payload) => {
        setActiveSession((prev) => prev ? { ...prev, status: 'payment_complete' } : prev);
      })
      .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
        setActiveSession(null);
      })
      .subscribe((status) => {
      });

    sessionChannelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      sessionChannelRef.current = null;
    };
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Channels 6 and 7 merged into requester-user channel above

  // ─── Location on mount — animate map to user position + stream ───────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        // One-time immediate fix
        const immediatePos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        if (!_hasInitialFix) {
          _hasInitialFix = true;
          _cachedRequesterCoords = { latitude: immediatePos.coords.latitude, longitude: immediatePos.coords.longitude };
          setUserCoords({ latitude: immediatePos.coords.latitude, longitude: immediatePos.coords.longitude });
          mapRef.current?.animateToRegion({
            latitude: immediatePos.coords.latitude,
            longitude: immediatePos.coords.longitude,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12,
          }, 800);
        }
        locationSub.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Highest, timeInterval: 2000, distanceInterval: 1, mayShowUserSettingsDialog: true },
          (loc) => {
            if (!_hasInitialFix) {
              _hasInitialFix = true;
              mapRef.current?.animateToRegion({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                latitudeDelta: 0.12,
                longitudeDelta: 0.12,
              }, 800);
            }
            _cachedRequesterCoords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setUserCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
        );
      } else {
        setUserCoords({ latitude: LAGOS_REGION.latitude, longitude: LAGOS_REGION.longitude });
      }
    })();
    return () => { locationSub.current?.remove(); };
  }, []);



  // ─── GPS diagnostic watcher ───────────────────────────────────────────────────
  useEffect(() => {
  }, [userCoords]);

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
  }, [sheetState, animateSheet]);

  // ─── Keep stable refs in sync with latest callbacks ──────────────────────────
  useEffect(() => { fetchActiveSessionRef.current = fetchActiveSession; }, [fetchActiveSession]);
  useEffect(() => { transitionToRef.current = transitionTo; }, [transitionTo]);

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
              low: { latitude: 6.35, longitude: 2.68 },
              high: { latitude: 6.70, longitude: 3.75 },
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
      SecureStore.setItemAsync(RECENT_PLACE_KEY, JSON.stringify(place)).then(() => {
        setRecentPlace(place);
      });
      transitionTo('config');
    } catch (e: any) {
      Alert.alert('Error', 'Could not load place details. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  }, [transitionTo]);

  // ─── Recent place tap ─────────────────────────────────────────────────────────
  const handleRecentPlaceTap = useCallback(() => {
    if (!recentPlace) return;
    setSelectedPlace(recentPlace);
    SecureStore.setItemAsync(RECENT_PLACE_KEY, JSON.stringify(recentPlace));
    transitionTo('config');
  }, [recentPlace, transitionTo]);

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
        Alert.alert(
          'No Match Found',
          'No doctor accepted your request at this time. Please try again or adjust your request parameters.',
          [{ text: 'OK', onPress: () => transitionTo('summary') }]
        );
      }, 180000);

      const channelName = `requester:${activeRequestId}`;
      realtimeChannelRef.current = supabase.channel(channelName)
        .on('broadcast', { event: 'MATCH_CONFIRMED' }, (payload) => {
          shouldPollRef.current = false;
          if (pollIntervalRef.current) {
            clearTimeout(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
          fetchActiveSessionRef.current();
          transitionToRef.current('idle');
        })
        .on('broadcast', { event: 'REQUEST_EXPIRED' }, () => {
          shouldPollRef.current = false;
          if (pollIntervalRef.current) {
            clearTimeout(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
          Alert.alert('Request Expired', 'Your request expired. Please try again.');
          transitionToRef.current('summary');
        })
        .subscribe((status) => {
          isRealtimeHealthyRef.current = status === 'SUBSCRIBED';
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
            shouldPollRef.current = false;
            if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
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
        if (!__DEV__ && isRealtimeHealthyRef.current) {
          // Realtime is healthy in production — skip this poll tick
          if (shouldPollRef.current) {
            pollIntervalRef.current = setTimeout(doPoll, 5000) as any;
          }
          return;
        }
        if (!shouldPollRef.current) return;

        try {
          const { data, error } = await supabase
            .from('coverage_requests')
            .select('status, matched_doctor_id')
            .eq('id', activeRequestId)
            .single();

          if (error) {
          } else if (data?.status === 'matched' && data?.matched_doctor_id) {
            shouldPollRef.current = false;
            if (matchTimerRef.current) clearTimeout(matchTimerRef.current);

            const { data: session } = await supabase
              .from('coverage_sessions')
              .select('doctor_name, doctor_mdcn, doctor_rating, doctor_reliability')
              .eq('request_id', activeRequestId)
              .single();

            if (session) {
              fetchActiveSessionRef.current();
              transitionToRef.current('idle');
            }
            return; // stop polling
          } else if (
            data?.status === 'cancelled' ||
            data?.status === 'withdrawn' ||
            data?.status === 'expired'
          ) {
            shouldPollRef.current = false;
            return; // stop polling
          }
        } catch (e: any) {
        }

        // Schedule next poll if still active
        if (shouldPollRef.current) {
          pollIntervalRef.current = setTimeout(doPoll, 5000) as any;
        }
      };

      // Start first poll after 3 seconds
      pollIntervalRef.current = setTimeout(doPoll, 3000) as any;

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

  // ─── Debounced live price preview from calculate-price edge function ──────────
  useEffect(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(async () => {
      const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
      const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
      let durationMinutes = endMinutes - startMinutes;
      if (durationMinutes <= 0) durationMinutes += 24 * 60; // handle overnight
      const durationHours = durationMinutes / 60;
      const shiftType = coverageType === 'Home Care' ? 'Home Care' : 'Standard';
      const toHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      setPreviewLoading(true);
      try {
        const res = await fetch(`${EDGE_BASE}/calculate-price`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coverage_type: coverageType,
            shift_type: shiftType,
            environment,
            duration_hours: durationHours,
            coverage_length: coverageLength,
            start_hour: startTime.getHours(),
            start_time: toHHMM(startTime),
            end_time: toHHMM(endTime),
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          return;
        }
        const data = await res.json();
        setPreviewPrice(data.price ?? 0);
        setPreviewHours(data.duration_hours ?? 0);
        setPreviewLabel(data.label ?? '');
      } catch (e: any) {
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [startTime, endTime, coverageType, environment, coverageLength]);

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
          transitionTo('searching');
        }
      },
    })
  ).current;

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleSearchTap = () => {
    transitionTo('searching');
  };

  const handleGoToSummary = () => {
    transitionTo('summary');
  };

  const handleRequestCoverage = async () => {
    if (!selectedPlace) return;
    setSubmitting(true);
    try {
      // Construct ISO datetime strings for start_date and end_date
      const shiftDateStr = shiftDate.toISOString().split('T')[0]; // YYYY-MM-DD

      const startDateObj = new Date(shiftDate);
      startDateObj.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);

      const endDateObj = new Date(shiftDate);
      endDateObj.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
      if (endDateObj <= startDateObj) {
        endDateObj.setDate(endDateObj.getDate() + 1);
      }

      const startDateISO = startDateObj.toISOString();
      const endDateISO = endDateObj.toISOString();

      const res = await fetchWithAuth('https://juilousufwlsiqdcgllu.supabase.co/functions/v1/submit-request', {
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
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Could not submit request');
      }
      const data = await res.json();
      setActiveRequestId(data.request_id || data.id || null);
      transitionTo('matching');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = useCallback(() => {
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

  const handleEditRequest = async () => {
    if (activeRequestId) {
      fetchWithAuth('https://juilousufwlsiqdcgllu.supabase.co/functions/v1/withdraw-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: activeRequestId }),
      }).catch(() => {});
    }
    // Clear match timer and realtime channel
    if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    setActiveRequestId(null);
    transitionTo('config');
  };

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCancelReasons, setShowCancelReasons] = useState(false);
  const [cancelWithdrawn, setCancelWithdrawn] = useState(false);
  const [showCancelActiveModal, setShowCancelActiveModal] = useState(false);
  const [showCancelActiveReasons, setShowCancelActiveReasons] = useState(false);
  const [showEndShiftModal, setShowEndShiftModal] = useState(false);
  const [showPauseShiftModal, setShowPauseShiftModal] = useState(false);
  const [settledAmount, setSettledAmount] = useState<number | null>(null);

  const handleCancelRequest = async () => {
    setShowCancelModal(true);
    // Immediately withdraw in background
    if (activeRequestId) {
      try {
        await fetchWithAuth('https://juilousufwlsiqdcgllu.supabase.co/functions/v1/withdraw-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: activeRequestId }),
        });
        setCancelWithdrawn(true);
      } catch (e) {
      }
    }
  };

  const handleWaitForDoctor = async () => {
    setShowCancelModal(false);
    if (activeRequestId && cancelWithdrawn) {
      try {
        await fetchWithAuth('https://juilousufwlsiqdcgllu.supabase.co/functions/v1/rebroadcast-request', {
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
    if (snap) {
      setConfirmedSession(snap);
      setShowPaymentSuccess(true);
    }
    setActiveSession(null);
  }, []); // no deps — reads from ref so never goes stale

  const handleCancelReasonSelected = async (reason: string) => {
    console.log('[Requester] Cancel reason selected:', reason, 'for request:', activeRequestId);
    // Update the request with cancellation reason
    if (activeRequestId) {
      try {
        const { error } = await supabase.from('coverage_requests')
          .update({ status: 'cancelled', cancellation_reason: reason, cancelled_by: 'requester' })
          .eq('id', activeRequestId);
        if (error) {
          console.error('[Requester] Failed to record cancellation reason:', error);
        } else {
          console.log('[Requester] Cancellation reason recorded successfully');
        }
      } catch (e) {
        console.error('[Requester] Exception recording cancellation reason:', e);
      }
    }
    setShowCancelReasons(false);
    setCancelWithdrawn(false);
    handleReset();
  };

  // ─── Session action handlers ──────────────────────────────────────────────────
  const callSessionEdge = useCallback(async (fn: string, sessionId: string) => {
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
  }, []);

  const handleStartShift = useCallback(async () => {
    if (!activeSession) return;
    try {
      const data = await callSessionEdge('start-shift', activeSession.id);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }, [activeSession, callSessionEdge]);

  const handleResumeShift = useCallback(async () => {
    if (!activeSession) return;
    try {
      const data = await callSessionEdge('resume-shift', activeSession.id);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }, [activeSession, callSessionEdge]);

  const handlePauseShift = useCallback(async () => {
    if (!activeSession) return;
    setShowPauseShiftModal(true);
  }, [activeSession]);

  const handleConfirmPauseShift = async () => {
    if (!activeSession) return;
    setShowPauseShiftModal(false);
    try {
      const data = await callSessionEdge('pause-shift', activeSession.id);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      Alert.alert('Pause Shift Failed', e.message || 'Something went wrong. Please try again.');
    }
  };

  const handleEndShift = useCallback(async () => {
    if (!activeSession) return;
    setShowEndShiftModal(true);
  }, [activeSession]);

  const handleConfirmEndShift = async () => {
    if (!activeSession) return;
    console.log('[Requester] handleConfirmEndShift: ending shift for session', activeSession.id);
    setShowEndShiftModal(false);
    try {
      const data = await callSessionEdge('end-shift', activeSession.id);
      console.log('[Requester] end-shift response:', JSON.stringify(data));
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) {
        // Ensure price from backend is merged in (covers multi-day total)
        if (updated.price != null) {
          console.log('[Requester] end-shift updated price from backend:', updated.price);
        }
        setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
      }
    } catch (e: any) {
      console.error('[Requester] end-shift failed:', e.message);
      Alert.alert('End Shift Failed', e.message || 'Something went wrong. Please try again.');
    }
  };

  // Fetch the authoritative payment_intents amount when session reaches settled/payment_complete
  useEffect(() => {
    const status = activeSession?.status;
    const sessionId = activeSession?.id;
    if (!sessionId || (status !== 'settled' && status !== 'payment_complete')) {
      return;
    }
    console.log('[Requester] Fetching payment_intent amount for settled session', sessionId);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('payment_intents')
          .select('amount_naira')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (error) {
          console.warn('[Requester] payment_intents fetch error:', error.message);
          return;
        }
        if (data?.amount_naira != null) {
          console.log('[Requester] payment_intent amount_naira:', data.amount_naira);
          setSettledAmount(Number(data.amount_naira));
        }
      } catch (e: any) {
        console.warn('[Requester] payment_intents fetch exception:', e.message);
      }
    })();
  }, [activeSession?.status, activeSession?.id]);

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
    setShowCancelActiveReasons(false);
    const sessionId = activeSession.id;
    // Clear immediately so the search card appears right away
    setActiveSession(null);
    try {
      const res = await fetchWithAuth(`${EDGE_BASE}/update-shift-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, status: 'cancelled', cancellation_reason: reason }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || 'Cancel failed');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
      // Re-fetch to restore correct state if the API call failed
      fetchActiveSession();
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
    <View style={{ flex: 1, backgroundColor: '#F9F9F6' }}>

      {/* ── FULL-SCREEN MAP (always behind everything) ── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={LAGOS_REGION}
        customMapStyle={MINIMALIST_MAP_STYLE}
        minZoomLevel={10}
        maxZoomLevel={18}
        onMapReady={() => {}}
      >
        {userCoords && (
          <Marker coordinate={userCoords} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#F59E0B', borderWidth: 2.5, borderColor: '#FFFFFF' }} />
          </Marker>
        )}
        {onlineDoctors.map((doc) => (
          <Marker
            key={doc.id}
            coordinate={{ latitude: doc.lat, longitude: doc.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', borderWidth: 2.5, borderColor: '#FFFFFF' }} />
          </Marker>
        ))}
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
            backgroundColor: '#FFFFFF',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <ArrowLeft size={20} color="#1C1C1E" />
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
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                  style={{
                    width: 160,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: '#F9F9F6',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
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
                {previewLoading ? '—' : coverageSubtitle}
              </Text>
              <TouchableOpacity
                onPress={handleRequestCoverage}
                disabled={submitting}
                activeOpacity={0.85}
                style={{
                  backgroundColor: submitting ? '#555' : '#FFFFFF',
                  borderRadius: 28,
                  paddingVertical: 18,
                  alignItems: 'center',
                  width: '100%',
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
      {(sheetState === 'searching' || sheetState === 'config' || sheetState === 'matching') && (
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
            />
          )}

          {/* No active session OR unhandled status — show search card */}
          {sessionFetched && (activeSession === null ||
            activeSession.status === 'completed' ||
            activeSession.status === 'cancelled' ||
            activeSession.status === 'requester_paid' ||
            activeSession.status === 'settled' ||
            activeSession.status === 'payment_complete' ||
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
                {/* Requester scores row */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 13, color: '#F4A261', fontFamily: 'Inter_600SemiBold' }}>
                    {'★ '}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#F4A261', fontFamily: 'Inter_600SemiBold' }}>
                    {requesterRating !== null ? requesterRating.toFixed(1) : '--'}
                  </Text>
                  <TouchableOpacity onPress={() => { console.log('[Requester] Info icon pressed: rating tooltip'); setTooltipVisible('rating'); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 3 }}>
                    <Feather name="info" size={11} color="#8E8E93" />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 13, color: '#8E8E93', marginHorizontal: 6 }}>{'·'}</Text>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759', marginRight: 4 }} />
                  <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>
                    {requesterReliability !== null ? requesterReliability.toFixed(0) : '--'}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{'%'}</Text>
                  <TouchableOpacity onPress={() => { console.log('[Requester] Info icon pressed: reliability tooltip'); setTooltipVisible('reliability'); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 3 }}>
                    <Feather name="info" size={11} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
                {/* Search capsule */}
                <TouchableOpacity
                  onPress={handleSearchTap}
                  activeOpacity={0.8}
                  style={{ backgroundColor: '#2C2C2E', borderRadius: 28, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <Search size={18} color="#8E8E93" />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Where is coverage needed?</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {/* ── REQUESTER RATING CARD ── */}
      <RequesterRatingCard
        visible={showPaymentSuccess}
        session={confirmedSession}
        amount={settledAmount ?? confirmedSession?.price ?? 0}
        ratingStars={ratingStars}
        ratingComment={ratingComment}
        ratingError={ratingError}
        submittingRating={submittingRating}
        onDismiss={() => {
          console.log('[Requester] Rating card dismissed', { sessionId: confirmedSession?.id });
          if (confirmedSession?.id) markRequesterSessionPaid(confirmedSession.id);
          setShowPaymentSuccess(false);
          setConfirmedSession(null);
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

      {/* Date picker modal — ITEM 5.2 maximumDate */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 12 }}>
                  <TouchableOpacity onPress={() => {
                    setShowDatePicker(false);
                  }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={shiftDate}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  maximumDate={maxDate}
                  style={{ backgroundColor: '#1C1C1E' }}
                  textColor="#FFFFFF"
                  onChange={(event, date) => {
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
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Start time picker modal — ITEM 4: custom picker */}
      <CustomTimePicker
        visible={showStartTimePicker}
        initialTime={startTime}
        isForDate={shiftDate}
        shiftDate={shiftDate}
        watNow={watNow}
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
        watNow={watNow}
        onDone={(date) => {
          setEndTime(date);
          setShowEndTimePicker(false);
        }}
        onCancel={() => {
          setShowEndTimePicker(false);
        }}
      />

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
                style={{ backgroundColor: '#2C2C2E', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
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
                style={{ backgroundColor: '#2C2C2E', borderRadius: 999, paddingVertical: 16, alignItems: 'center' }}
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
                style={{ backgroundColor: '#2C2C2E', borderRadius: 999, paddingVertical: 16, alignItems: 'center' }}
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
  );
}

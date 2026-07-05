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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { supabase, getValidToken } from '@/lib/supabase';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { useTabBarVisibility, TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';
import { useAuth } from '@/contexts/AuthContext';
import type { CoverageSession } from '@/contexts/DoctorDispatchContext';

const EDGE_BASE = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1';



const ANDROID_KEY = 'AIzaSyACeTm0j_ajj-rRObPbkDBJvW6GVBt6SMU';
const IOS_KEY = 'AIzaSyBFC2FPkzjooOJhFwkMsM_o3qQiTOn0rZk';
const MAPS_KEY = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;

const RECENT_PLACE_KEY = 'flashlocum_recent_place';

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
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
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'poi.park', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
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
  }, [visible]);

  const handleDone = () => {
    // Convert 12h + AM/PM to 24h
    let h24: number;
    if (selectedAmPm === 'AM') {
      h24 = selectedHour === 12 ? 0 : selectedHour;
    } else {
      h24 = selectedHour === 12 ? 12 : selectedHour + 12;
    }
    console.log('[CustomTimePicker] Done pressed — h24:', h24, 'minute:', selectedMinute, 'ampm:', selectedAmPm);
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
          console.log('[CustomTimePicker] Hour selected:', item);
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
          console.log('[CustomTimePicker] Minute selected:', item);
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
                          console.log('[CustomTimePicker] AM/PM selected:', item);
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
  const perDayHours = shiftMs / (1000 * 60 * 60);
  const coverageLength = Math.max(1, session.coverage_length ?? 1);
  const totalHours = perDayHours * coverageLength;
  const hoursDisplay = totalHours % 1 === 0 ? `${totalHours}hr` : `${totalHours.toFixed(1)}hr`;
  const priceDisplay = `₦${Number(session.price).toLocaleString()}`;
  const shiftStart = formatSessionTime(session.shift_start);
  const shiftEnd = formatSessionTime(session.shift_end);
  const sep = ' ● ';

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
  const shiftPillText = buildShiftPillText(session);
  const rawDoctorName = session.doctor_name || '';
  // Strip any existing Dr. prefix then re-apply exactly once
  const cleanName = rawDoctorName.replace(/^dr\.?\s*/i, '').trim();
  const doctorName = cleanName && !cleanName.includes('@') ? `Dr. ${cleanName}` : 'Doctor';
  const initials = cleanName ? getSessionInitials(cleanName) : 'DR';
  const ratingRaw = Number(session.doctor_rating);
  const ratingDisplay = (!session.doctor_rating || isNaN(ratingRaw) || ratingRaw === 0) ? '—' : ratingRaw.toFixed(1);
  const reliabilityRaw = Number(session.doctor_reliability);
  const reliabilityDisplay = (!session.doctor_reliability || isNaN(reliabilityRaw) || reliabilityRaw === 0) ? '—' : String(Math.round(reliabilityRaw));

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
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759', marginHorizontal: 5 }} />
            <Text style={{ fontSize: 12, color: '#34C759', fontFamily: 'Inter_600SemiBold' }}>
              {reliabilityDisplay === '—' ? '—' : reliabilityDisplay}
            </Text>
            {reliabilityDisplay !== '—' && (
              <Text style={{ fontSize: 12, color: '#34C759', fontFamily: 'Inter_600SemiBold' }}>{'%'}</Text>
            )}
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
          <TouchableOpacity onPress={() => { console.log('[RequesterHome] Cancel shift pressed:', session.id); onCancel(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }}>CANCEL SHIFT</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { console.log('[RequesterHome] Call doctor pressed:', session.id); onCall(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#0A0A0A', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>CALL</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { console.log('[RequesterHome] Start shift pressed:', session.id); onStartShift(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#34C759', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#1C1C1E' }}>START SHIFT</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => { console.log('[RequesterHome] Call doctor pressed (paused):', session.id); onCall(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#0A0A0A', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>CALL</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { console.log('[RequesterHome] Resume shift pressed:', session.id); onResumeShift(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#34C759', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#1C1C1E' }}>RESUME SHIFT</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { console.log('[RequesterHome] End shift pressed (paused):', session.id); onEndShift(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#FF3B30', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>END SHIFT</Text>
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
  const ratingRaw = Number(session.doctor_rating);
  const ratingDisplay = (!session.doctor_rating || isNaN(ratingRaw) || ratingRaw === 0) ? '—' : ratingRaw.toFixed(1);
  const reliabilityRaw = Number(session.doctor_reliability);
  const reliabilityDisplay = (!session.doctor_reliability || isNaN(reliabilityRaw) || reliabilityRaw === 0) ? '—' : String(Math.round(reliabilityRaw));
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
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759', marginHorizontal: 5 }} />
            <Text style={{ fontSize: 12, color: '#34C759', fontFamily: 'Inter_600SemiBold' }}>
              {reliabilityDisplay === '—' ? '—' : reliabilityDisplay}
            </Text>
            {reliabilityDisplay !== '—' && (
              <Text style={{ fontSize: 12, color: '#34C759', fontFamily: 'Inter_600SemiBold' }}>{'%'}</Text>
            )}
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
          <TouchableOpacity onPress={() => { console.log('[RequesterHome] Pause shift pressed:', session.id); onPauseShift(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }}>PAUSE SHIFT</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => { console.log('[RequesterHome] End shift pressed:', session.id); onEndShift(); }}
          activeOpacity={0.8}
          style={{ flex: 1, backgroundColor: '#FF3B30', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>END SHIFT</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { console.log('[RequesterHome] Call doctor pressed (active):', session.id); onCall(); }}
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
}: {
  session: CoverageSession;
  bottomPadding: number;
}) {
  const [countdown, setCountdown] = useState('--:--');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!session.payment_deadline_at) return;
    const tick = () => {
      const diffMs = new Date(session.payment_deadline_at!).getTime() - Date.now();
      if (diffMs <= 0) {
        setIsExpired(true);
        setCountdown('00:00');
      } else {
        setIsExpired(false);
        setCountdown(formatCountdown(session.payment_deadline_at!));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.payment_deadline_at]);

  const amountDisplay = formatNaira(session.price * 100);
  const accountNumber = session.monnify_account_number ?? '—';
  const bankName = session.monnify_bank_name ?? '—';
  const accountName = session.monnify_account_name ?? '—';

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
      {/* Drag handle (decorative only) */}
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <View style={{ width: 40, height: 5, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
      </View>

      <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold', marginBottom: 8 }}>
        PAYMENT DUE
      </Text>
      <Text style={{ fontSize: 44, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 4 }}>
        {amountDisplay}
      </Text>

      <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 12 }}>
        Transfer to:
      </Text>

      <View style={{ backgroundColor: '#2C2C2E', borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>{accountNumber}</Text>
          <Text style={{ fontSize: 14, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>·</Text>
          <Text style={{ fontSize: 14, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>{bankName}</Text>
        </View>
        <Text style={{ fontSize: 14, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' }}>{accountName}</Text>
      </View>

      {/* Countdown */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Text style={{ fontSize: 13, color: '#8E8E93' }}>⏱</Text>
        {isExpired ? (
          <Text style={{ fontSize: 15, color: '#FF9500', fontFamily: 'Inter_600SemiBold' }}>
            Extending payment window...
          </Text>
        ) : (
          <Text style={{ fontSize: 15, color: '#FFFFFF', fontFamily: 'Inter_700Bold' }}>
            {countdown}
            <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}> remaining</Text>
          </Text>
        )}
      </View>

      <Text style={{ fontSize: 12, color: '#8E8E93', fontFamily: 'Inter_400Regular', lineHeight: 18 }}>
        Payment timer is server-controlled. This window will extend automatically if payment is not received in time.
      </Text>
    </View>
  );
}

export default function RequesterHomeScreen() {
  const insets = useSafeAreaInsets();
  const { setTabBarVisible } = useTabBarVisibility();
  const { user } = useAuth();

  const mapRef = useRef<MapView>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const hasInitialFix = useRef(false);

  // Sheet state
  const [sheetState, setSheetState] = useState<SheetState>('idle');
  const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHTS.idle)).current;

  // Place
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

  // Recent place
  const [recentPlace, setRecentPlace] = useState<SelectedPlace | null>(null);

  // Search (Places API New)
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    placeId: string;
    mainText: string;
    secondaryText: string;
  }>>([]);
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
  const [activeSession, setActiveSession] = useState<CoverageSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const sessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const requesterChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Realtime refs for matching
  const matchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldPollRef = useRef(false);

  // ─── Load recent place on mount ───────────────────────────────────────────────
  useEffect(() => {
    SecureStore.getItemAsync(RECENT_PLACE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as SelectedPlace;
          console.log('[RequesterHome] Loaded recent place:', parsed.name);
          setRecentPlace(parsed);
        } catch {
          console.log('[RequesterHome] Failed to parse recent place');
        }
      }
    });
  }, []);

  // ─── Fetch active session helper ──────────────────────────────────────────────
  const fetchActiveSession = useCallback(async () => {
    console.log('[RequesterHome] Fetching active session for requester');
    try {
      const token = await getValidToken();
      if (!token) return;
      const res = await fetch(`${EDGE_BASE}/get-active-session?role=requester`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('[RequesterHome] get-active-session response:', res.status);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.log('[RequesterHome] get-active-session error:', errText);
        return;
      }
      const data = await res.json();
      const session: CoverageSession | null = data?.session ?? null;
      console.log('[RequesterHome] Active session fetched:', session?.id ?? 'none', 'status:', session?.status ?? 'none');
      setActiveSession(session);
    } catch (e: any) {
      console.log('[RequesterHome] fetchActiveSession error:', e.message);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  // ─── On mount — restore session state ────────────────────────────────────────
  useEffect(() => {
    fetchActiveSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── AppState reconnection safety net ────────────────────────────────────────
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[RequesterHome] App foregrounded — re-fetching active session');
        fetchActiveSession();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [fetchActiveSession]);

  // ─── Session realtime subscription ───────────────────────────────────────────
  useEffect(() => {
    if (!activeSession) {
      if (sessionChannelRef.current) {
        console.log('[RequesterHome] No active session — removing session channel');
        supabase.removeChannel(sessionChannelRef.current);
        sessionChannelRef.current = null;
      }
      return;
    }

    const channelName = `session:${activeSession.id}`;
    console.log('[RequesterHome] Subscribing to session channel:', channelName);

    if (sessionChannelRef.current) {
      supabase.removeChannel(sessionChannelRef.current);
      sessionChannelRef.current = null;
    }

    const ch = supabase.channel(channelName)
      .on('broadcast', { event: 'SHIFT_STARTED' }, (payload) => {
        console.log('[RequesterHome] SHIFT_STARTED received:', payload);
        const updated = payload?.payload?.session as Partial<CoverageSession>;
        setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
      })
      .on('broadcast', { event: 'SHIFT_PAUSED' }, (payload) => {
        console.log('[RequesterHome] SHIFT_PAUSED received:', payload);
        const updated = payload?.payload?.session as Partial<CoverageSession>;
        setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
      })
      .on('broadcast', { event: 'SHIFT_RESUMED' }, (payload) => {
        console.log('[RequesterHome] SHIFT_RESUMED received:', payload);
        const updated = payload?.payload?.session as Partial<CoverageSession>;
        setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
      })
      .on('broadcast', { event: 'SHIFT_ENDED' }, (payload) => {
        console.log('[RequesterHome] SHIFT_ENDED received:', payload);
        const updated = payload?.payload?.session as Partial<CoverageSession>;
        setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
      })
      .on('broadcast', { event: 'PAYMENT_DEADLINE_EXTENDED' }, (payload) => {
        console.log('[RequesterHome] PAYMENT_DEADLINE_EXTENDED received:', payload);
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
        console.log('[RequesterHome] PAYMENT_CONFIRMED received:', payload);
        setActiveSession(null);
      })
      .on('broadcast', { event: 'PAYMENT_COMPLETE' }, (payload) => {
        console.log('[RequesterHome] PAYMENT_COMPLETE received:', payload);
        setActiveSession((prev) => prev ? { ...prev, status: 'payment_complete' } : prev);
      })
      .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
        console.log('[RequesterHome] SHIFT_CANCELLED received:', payload);
        setActiveSession(null);
      })
      .subscribe((status) => {
        console.log('[RequesterHome] Session channel status:', channelName, status);
      });

    sessionChannelRef.current = ch;

    return () => {
      console.log('[RequesterHome] Unsubscribing from session channel:', channelName);
      supabase.removeChannel(ch);
      sessionChannelRef.current = null;
    };
  }, [activeSession?.id]); // only re-subscribe when session ID changes

  // ─── Personal requester channel (fallback for SHIFT_CANCELLED) ───────────────
  useEffect(() => {
    if (!user) return;
    const channelName = `requester:${user.id}`;
    console.log('[RequesterHome] Subscribing to personal requester channel:', channelName);

    if (requesterChannelRef.current) {
      supabase.removeChannel(requesterChannelRef.current);
      requesterChannelRef.current = null;
    }

    const ch = supabase.channel(channelName)
      .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
        console.log('[RequesterHome] SHIFT_CANCELLED received (requester channel):', payload);
        setActiveSession(null);
      })
      .subscribe((status) => {
        console.log('[RequesterHome] Requester channel status:', channelName, status);
      });

    requesterChannelRef.current = ch;

    return () => {
      console.log('[RequesterHome] Unsubscribing from requester channel:', channelName);
      supabase.removeChannel(ch);
      requesterChannelRef.current = null;
    };
  }, [user]); // subscribe once when user is available

  // ─── Location on mount — animate map to user position + stream ───────────────
  useEffect(() => {
    (async () => {
      console.log('[RequesterHome] Requesting location permission');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        // One-time immediate fix
        console.log('[RequesterHome] Fetching immediate GPS fix');
        const immediatePos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        console.log('[RequesterHome][GPS-1] getCurrentPosition:', {
          lat: immediatePos.coords.latitude,
          lng: immediatePos.coords.longitude,
          accuracy: immediatePos.coords.accuracy,
          timestamp: new Date(immediatePos.timestamp).toISOString(),
          mapRefReady: !!mapRef.current,
          hasInitialFix: hasInitialFix.current,
        });
        if (!hasInitialFix.current) {
          hasInitialFix.current = true;
          console.log('[RequesterHome] Immediate GPS fix:', immediatePos.coords.latitude, immediatePos.coords.longitude);
          setUserCoords({ latitude: immediatePos.coords.latitude, longitude: immediatePos.coords.longitude });
          console.log('[RequesterHome][MAP-ANIMATE] animateToRegion:', { latitude: immediatePos.coords.latitude, longitude: immediatePos.coords.longitude, source: 'immediatePos' });
          mapRef.current?.animateToRegion({
            latitude: immediatePos.coords.latitude,
            longitude: immediatePos.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 800);
        }
        console.log('[RequesterHome] Starting watch stream');
        locationSub.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Highest, timeInterval: 2000, distanceInterval: 1, mayShowUserSettingsDialog: true },
          (loc) => {
            console.log('[RequesterHome][GPS-2] watchPosition update:', {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              accuracy: loc.coords.accuracy,
              timestamp: new Date(loc.timestamp).toISOString(),
              hasInitialFix: hasInitialFix.current,
              mapRefReady: !!mapRef.current,
            });
            if (!hasInitialFix.current) {
              hasInitialFix.current = true;
              console.log('[RequesterHome][MAP-ANIMATE] animateToRegion:', { latitude: loc.coords.latitude, longitude: loc.coords.longitude, source: 'watchStream' });
              mapRef.current?.animateToRegion({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }, 800);
            }
            setUserCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
        );
      } else {
        console.log('[RequesterHome] Location permission denied, using Lagos fallback');
        setUserCoords({ latitude: LAGOS_REGION.latitude, longitude: LAGOS_REGION.longitude });
      }
    })();
    return () => { locationSub.current?.remove(); };
  }, []);

  // ─── Pulse animation loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // ─── GPS diagnostic watcher ───────────────────────────────────────────────────
  useEffect(() => {
    console.log('[RequesterHome][MARKER-STATE] userCoords changed:', userCoords);
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
    console.log('[RequesterHome] Sheet state transition:', sheetState, '->', state);
    setSheetState(state);
    animateSheet(state);
  }, [sheetState, animateSheet]);

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
      console.log('[PlacesNew] Searching for:', input);
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
      console.log('[PlacesNew] autocomplete response status:', response.status);
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
        console.log('[PlacesNew] No suggestions:', JSON.stringify(data));
        setSearchResults([]);
      }
    } catch (e: any) {
      console.error('[PlacesNew] fetch error:', e.message);
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
    console.log('[PlacesNew] Place result tapped:', mainText, placeId);
    Keyboard.dismiss();
    setSearchLoading(true);
    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}?fields=id,displayName,formattedAddress,location&key=${MAPS_KEY}`
      );
      const data = await response.json();
      console.log('[PlacesNew] place details:', JSON.stringify(data));
      if (!data.location) throw new Error('No location in place details');
      const address = data.formattedAddress || mainText;
      // Client-side Lagos safety check
      if (!address.toLowerCase().includes('lagos')) {
        console.log('[PlacesNew] Rejected non-Lagos result:', address);
        return;
      }
      const place: SelectedPlace = {
        name: data.displayName?.text || mainText,
        address,
        lat: data.location.latitude,
        lng: data.location.longitude,
      };
      console.log('[PlacesNew] Place selected:', place.name, { lat: place.lat, lng: place.lng });
      setSelectedPlace(place);
      setSearchText('');
      setSearchResults([]);
      // Save to recent
      SecureStore.setItemAsync(RECENT_PLACE_KEY, JSON.stringify(place)).then(() => {
        console.log('[RequesterHome] Saved recent place:', place.name);
        setRecentPlace(place);
      });
      transitionTo('config');
    } catch (e: any) {
      console.error('[PlacesNew] place details error:', e.message);
      Alert.alert('Error', 'Could not load place details. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  }, [transitionTo]);

  // ─── Recent place tap ─────────────────────────────────────────────────────────
  const handleRecentPlaceTap = useCallback(() => {
    if (!recentPlace) return;
    console.log('[RequesterHome] Recent place tapped:', recentPlace.name);
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
        duration: 15000,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [sheetState, matchProgressAnim]);

  // ─── Realtime matching subscription + 180s timeout ───────────────────────────
  useEffect(() => {
    if (activeRequestId) {
      console.log('[RequesterHome] Starting match timer and subscribing to requester channel:', activeRequestId);

      matchTimerRef.current = setTimeout(() => {
        console.log('[RequesterHome] Match timeout — no doctor accepted in 180s');
        Alert.alert(
          'No Match Found',
          'No doctor accepted your request at this time. Please try again or adjust your request parameters.',
          [{ text: 'OK', onPress: () => transitionTo('summary') }]
        );
      }, 180000);

      const channelName = `requester:${activeRequestId}`;
      realtimeChannelRef.current = supabase.channel(channelName)
        .on('broadcast', { event: 'MATCH_CONFIRMED' }, (payload) => {
          console.log('[RequesterHome] MATCH_CONFIRMED received:', JSON.stringify(payload));
          shouldPollRef.current = false; // stop poll
          if (pollIntervalRef.current) {
            console.log('[RequesterHome] MATCH_CONFIRMED — clearing poll timeout');
            clearTimeout(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
          console.log('[RequesterHome] MATCH_CONFIRMED — fetching active session and resetting to idle');
          fetchActiveSession();
          transitionTo('idle');
        })
        .on('broadcast', { event: 'REQUEST_EXPIRED' }, () => {
          console.log('[RequesterHome] REQUEST_EXPIRED received');
          shouldPollRef.current = false;
          if (pollIntervalRef.current) {
            clearTimeout(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
          Alert.alert('Request Expired', 'Your request expired. Please try again.');
          transitionTo('summary');
        })
        .subscribe((status) => {
          console.log('[RequesterHome] Realtime channel status:', channelName, status);
        });

      // Poll as fallback in case MATCH_CONFIRMED broadcast was missed
      // Uses recursive setTimeout + shouldPollRef to survive StrictMode double-invocation
      shouldPollRef.current = true;

      const doPoll = async () => {
        if (!shouldPollRef.current) return;
        console.log('[RequesterHome] Polling for match status:', activeRequestId);

        try {
          const { data, error } = await supabase
            .from('coverage_requests')
            .select('status, matched_doctor_id')
            .eq('id', activeRequestId)
            .single();

          if (error) {
            console.log('[RequesterHome] Poll error:', error.message);
          } else if (data?.status === 'matched' && data?.matched_doctor_id) {
            console.log('[RequesterHome] Poll detected match — fetching doctor details');
            shouldPollRef.current = false;
            if (matchTimerRef.current) clearTimeout(matchTimerRef.current);

            const { data: session } = await supabase
              .from('coverage_sessions')
              .select('doctor_name, doctor_mdcn, doctor_rating, doctor_reliability')
              .eq('request_id', activeRequestId)
              .single();

            if (session) {
              console.log('[RequesterHome] Poll match confirmed — fetching active session and resetting to idle');
              fetchActiveSession();
              transitionTo('idle');
            }
            return; // stop polling
          } else if (
            data?.status === 'cancelled' ||
            data?.status === 'withdrawn' ||
            data?.status === 'expired'
          ) {
            console.log('[RequesterHome] Poll detected cancellation/expiry:', data.status);
            shouldPollRef.current = false;
            return; // stop polling
          }
        } catch (e: any) {
          console.log('[RequesterHome] Poll exception:', e.message);
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
          console.log('[RequesterHome] Cleanup — clearing poll timeout');
          clearTimeout(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (realtimeChannelRef.current) {
          console.log('[RequesterHome] Removing realtime channel:', channelName);
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }
      };
    }
    return undefined;
  }, [activeRequestId]);

  // ─── Show tab bar only when idle ─────────────────────────────────────────────
  useEffect(() => {
    setTabBarVisible(sheetState === 'idle');
  }, [sheetState]);

  // ─── Debounced live price preview from calculate-price edge function ──────────
  useEffect(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(async () => {
      const startStr = startTime.toTimeString().slice(0, 5);
      const endStr = endTime.toTimeString().slice(0, 5);
      console.log('[RequesterHome] Fetching price preview — start:', startStr, 'end:', endStr, 'length:', coverageLength, 'type:', coverageType, 'env:', environment);
      setPreviewLoading(true);
      try {
        const res = await fetch(`${EDGE_BASE}/calculate-price`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start_time: startStr,
            end_time: endStr,
            coverage_length: coverageLength,
            coverage_type: coverageType,
            environment,
          }),
        });
        console.log('[RequesterHome] calculate-price response status:', res.status);
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.log('[RequesterHome] calculate-price error:', errText);
          return;
        }
        const data = await res.json();
        console.log('[RequesterHome] calculate-price result:', data);
        setPreviewPrice(data.price ?? 0);
        setPreviewHours(data.duration_hours ?? 0);
        setPreviewLabel(data.label ?? '');
      } catch (e: any) {
        console.log('[RequesterHome] calculate-price fetch error:', e.message);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [startTime, endTime, coverageLength, coverageType, environment]);

  // ─── Drag handle PanResponder ─────────────────────────────────────────────────
  const handleResetRef = useRef<() => void>(() => {});

  const dragPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: () => {},
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 15) {
          console.log('[RequesterHome] Drag handle released — resetting');
          Keyboard.dismiss();
          handleResetRef.current();
        }
      },
      onPanResponderTerminate: (_, gs) => {
        if (gs.dy > 15) {
          console.log('[RequesterHome] Drag handle terminated — resetting');
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
          console.log('[RequesterHome] Idle drag handle swiped up — opening search');
          transitionTo('searching');
        }
      },
    })
  ).current;

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleSearchTap = () => {
    console.log('[RequesterHome] Search input tapped');
    transitionTo('searching');
  };

  const handleGoToSummary = () => {
    console.log('[RequesterHome] Proceeding to summary');
    transitionTo('summary');
  };

  const handleRequestCoverage = async () => {
    if (!selectedPlace) return;
    console.log('[RequesterHome] Request Coverage tapped — submitting to submit-request Edge Function');
    setSubmitting(true);
    try {
      const token = await getValidToken();
      if (!token) throw new Error('Not authenticated');
      console.log('[RequesterHome] Calling submit-request for place:', selectedPlace.name);

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
      console.log('[RequesterHome] Constructed start_date:', startDateISO, 'end_date:', endDateISO);

      const res = await fetch('https://juilousufwlsiqdcgllu.supabase.co/functions/v1/submit-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
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
      console.log('[RequesterHome] submit-request response status:', res.status);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Could not submit request');
      }
      const data = await res.json();
      console.log('[RequesterHome] submit-request success, request_id:', data.request_id || data.id);
      setActiveRequestId(data.request_id || data.id || null);
      transitionTo('matching');
    } catch (e: any) {
      console.log('[RequesterHome] Submit error:', e.message);
      Alert.alert('Error', e.message || 'Could not submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = useCallback(() => {
    console.log('[RequesterHome] Resetting to idle');
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
    console.log('[RequesterHome] Edit Request tapped — withdrawing in-flight request');
    if (activeRequestId) {
      const token = await getValidToken();
      if (token) {
        fetch('https://juilousufwlsiqdcgllu.supabase.co/functions/v1/withdraw-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ request_id: activeRequestId }),
        }).catch(() => {});
      }
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

  const handleCancelRequest = async () => {
    console.log('[RequesterHome] Cancel tapped — showing modal and withdrawing in background');
    setShowCancelModal(true);
    // Immediately withdraw in background
    if (activeRequestId) {
      const token = await getValidToken();
      if (token) {
        try {
          await fetch('https://juilousufwlsiqdcgllu.supabase.co/functions/v1/withdraw-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ request_id: activeRequestId }),
          });
          setCancelWithdrawn(true);
          console.log('[RequesterHome] Request withdrawn while cancel modal is open');
        } catch (e) {
          console.log('[RequesterHome] Withdraw failed silently:', e);
        }
      }
    }
  };

  const handleWaitForDoctor = async () => {
    console.log('[RequesterHome] Wait for Doctor — re-broadcasting request');
    setShowCancelModal(false);
    if (activeRequestId && cancelWithdrawn) {
      const token = await getValidToken();
      if (token) {
        try {
          await fetch('https://juilousufwlsiqdcgllu.supabase.co/functions/v1/rebroadcast-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ request_id: activeRequestId }),
          });
          console.log('[RequesterHome] Request re-broadcast successfully');
        } catch (e) {
          console.log('[RequesterHome] Re-broadcast failed:', e);
        }
      }
    }
    setCancelWithdrawn(false);
  };

  const handleConfirmCancel = () => {
    setShowCancelModal(false);
    setShowCancelReasons(true);
  };

  const handleCancelReasonSelected = async (reason: string) => {
    console.log('[RequesterHome] Cancel reason selected:', reason);
    // Update the request with cancellation reason
    if (activeRequestId) {
      const token = await getValidToken();
      if (token) {
        supabase.from('dispatch_requests')
          .update({ status: 'cancelled', cancellation_reason: reason })
          .eq('id', activeRequestId)
          .then(() => console.log('[RequesterHome] Cancellation reason saved'));
      }
    }
    setShowCancelReasons(false);
    setCancelWithdrawn(false);
    handleReset();
  };

  // ─── Session action handlers ──────────────────────────────────────────────────
  const callSessionEdge = useCallback(async (fn: string, sessionId: string) => {
    const token = await getValidToken();
    if (!token) throw new Error('Not authenticated');
    console.log('[RequesterHome] Calling session edge function:', fn, 'session:', sessionId);
    const res = await fetch(`${EDGE_BASE}/${fn}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    console.log('[RequesterHome]', fn, 'response:', res.status);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(errText || `${fn} failed`);
    }
    return res.json();
  }, []);

  const handleStartShift = useCallback(async () => {
    if (!activeSession) return;
    console.log('[RequesterHome] Start shift pressed for session:', activeSession.id);
    try {
      const data = await callSessionEdge('start-shift', activeSession.id);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      console.log('[RequesterHome] Start shift error:', e.message);
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }, [activeSession, callSessionEdge]);

  const handleResumeShift = useCallback(async () => {
    if (!activeSession) return;
    console.log('[RequesterHome] Resume shift pressed for session:', activeSession.id);
    try {
      const data = await callSessionEdge('resume-shift', activeSession.id);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      console.log('[RequesterHome] Resume shift error:', e.message);
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }, [activeSession, callSessionEdge]);

  const handlePauseShift = useCallback(async () => {
    if (!activeSession) return;
    console.log('[RequesterHome] Pause shift pressed for session:', activeSession.id);
    try {
      const data = await callSessionEdge('pause-shift', activeSession.id);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      console.log('[RequesterHome] Pause shift error:', e.message);
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }, [activeSession, callSessionEdge]);

  const handleEndShift = useCallback(async () => {
    if (!activeSession) return;
    console.log('[RequesterHome] End shift pressed for session:', activeSession.id);
    try {
      const data = await callSessionEdge('end-shift', activeSession.id);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      console.log('[RequesterHome] End shift error:', e.message);
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }, [activeSession, callSessionEdge]);

  const handleCancelActiveShift = useCallback(() => {
    if (!activeSession) return;
    Alert.alert('Cancel Shift?', 'This will cancel the booking.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Shift',
        style: 'destructive',
        onPress: async () => {
          console.log('[RequesterHome] Cancel active shift confirmed:', activeSession.id);
          try {
            const token = await getValidToken();
            if (!token) throw new Error('Not authenticated');
            const res = await fetch(`${EDGE_BASE}/update-shift-status`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: activeSession.id, status: 'cancelled' }),
            });
            console.log('[RequesterHome] update-shift-status response:', res.status);
            if (!res.ok) {
              const errText = await res.text().catch(() => '');
              throw new Error(errText || 'Cancel failed');
            }
            setActiveSession(null);
          } catch (e: any) {
            console.log('[RequesterHome] Cancel active shift error:', e.message);
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }, [activeSession]);

  const handleCallDoctor = useCallback(() => {
    if (!activeSession?.doctor_phone) {
      Alert.alert('No phone number available');
      return;
    }
    console.log('[RequesterHome] Call doctor pressed:', activeSession.doctor_phone);
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
  console.log('[RequesterHome] RENDER — Platform:', Platform.OS, 'MapView type:', typeof MapView, 'MapView value:', MapView);
  console.log('[RequesterHome] About to render MapView — provider:', PROVIDER_GOOGLE, 'ref:', !!mapRef);
  return (
    <View style={{ flex: 1, backgroundColor: '#F9F9F6' }}>

      {/* ── FULL-SCREEN MAP (always behind everything) ── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={LAGOS_REGION}
        customMapStyle={MINIMALIST_MAP_STYLE}
        maxZoomLevel={14}
        onMapReady={() => console.log('[RequesterHome] MAP READY ✓')}
      >
        {userCoords && (
          <Marker coordinate={userCoords} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={{
                position: 'absolute', width: 100, height: 100, borderRadius: 50,
                backgroundColor: 'rgba(37,99,235,0.12)',
                transform: [{ scale: pulseAnim }],
                opacity: pulseAnim.interpolate({ inputRange: [1, 1.6], outputRange: [0.9, 0], extrapolate: 'clamp' }),
              }} />
              <View style={{ position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(37,99,235,0.22)' }} />
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#2563EB', borderWidth: 2.5, borderColor: '#FFFFFF', shadowColor: '#2563EB', shadowOpacity: 0.5, shadowRadius: 4, elevation: 4 }} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ── RE-CENTRE FAB ── */}
      {userCoords && (
        <TouchableOpacity
          onPress={() => {
            console.log('[RequesterHome] Re-centre FAB pressed');
            mapRef.current?.animateToRegion(
              { latitude: userCoords.latitude, longitude: userCoords.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 },
              500
            );
          }}
          activeOpacity={0.85}
          style={{
            position: 'absolute',
            top: insets.top + 16,
            right: 16,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#FFFFFF',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 6,
            elevation: 6,
          }}
        >
          <MapPin size={20} color="#1C1C1E" />
        </TouchableOpacity>
      )}

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
                    <Text style={[TYPOGRAPHY.caption, { color: '#8E8E93' }]} numberOfLines={1} ellipsizeMode="tail">
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
                      console.log('[RequesterHome] Coverage type set to Standard');
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
                      console.log('[RequesterHome] Coverage type set to Home Care');
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
                    console.log('[RequesterHome] Start date picker opened');
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
                    console.log('[RequesterHome] Start time picker opened');
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
                    console.log('[RequesterHome] End time picker opened');
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
                        console.log('[RequesterHome] Coverage length decremented to:', next);
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
                        console.log('[RequesterHome] Coverage length incremented to:', next);
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
                        console.log('[RequesterHome] Environment set to Normal');
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
                        console.log('[RequesterHome] Environment set to Busy');
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
                    console.log('[RequesterHome] Note updated');
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
              <Text style={[TYPOGRAPHY.h2, { color: '#FFFFFF', marginBottom: 4 }]}>Medical Officer Found</Text>
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
                  <Text style={{ fontSize: 12, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>A</Text>
                  <Text style={{ fontSize: 12, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>B</Text>
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
          {/* Loading state */}
          {sessionLoading && (
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
              <View style={{
                backgroundColor: '#1C1C1E',
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                paddingTop: 16, paddingHorizontal: 16,
                paddingBottom: whiteCardPaddingBottom,
                minHeight: 120,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            </View>
          )}

          {/* Active session — upcoming or paused */}
          {!sessionLoading && activeSession !== null &&
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
          {!sessionLoading && activeSession !== null && activeSession.status === 'active' && (
            <RequesterActiveCard
              session={activeSession}
              onCall={handleCallDoctor}
              onPauseShift={handlePauseShift}
              onEndShift={handleEndShift}
              bottomPadding={whiteCardPaddingBottom}
            />
          )}

          {/* Active session — payment pending */}
          {!sessionLoading && activeSession !== null && activeSession.status === 'payment_pending' && (
            <RequesterPaymentCard
              session={activeSession}
              bottomPadding={whiteCardPaddingBottom}
            />
          )}

          {/* Settled — payment received, awaiting doctor bank remittance */}
          {!sessionLoading && activeSession !== null && activeSession.status === 'settled' && (
            <View style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              backgroundColor: '#1C1C1E',
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingTop: 16, paddingHorizontal: 16,
              paddingBottom: whiteCardPaddingBottom,
              shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
              shadowOpacity: 0.08, shadowRadius: 10, elevation: 10,
            }}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 40, height: 5, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e', marginRight: 8 }} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#22c55e', fontFamily: 'Inter_600SemiBold' }}>Payment Confirmed</Text>
              </View>
              <Text style={{ fontSize: 44, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 4 }}>
                {'₦'}{(activeSession.price ?? 0).toLocaleString()}
              </Text>
              <Text style={{ fontSize: 14, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 16 }}>
                {'Payment received. Funds are being remitted to '}
                {activeSession.doctor_name ?? 'the doctor'}
                {'.'}
              </Text>
              <View style={{ backgroundColor: '#1A3A2A', borderRadius: 10, padding: 14 }}>
                <Text style={{ fontSize: 13, color: '#34C759', fontWeight: '500', fontFamily: 'Inter_600SemiBold' }}>{'✓ Settled'}</Text>
                <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 4, fontFamily: 'Inter_400Regular' }}>
                  The shift has been completed and payment confirmed.
                </Text>
              </View>
            </View>
          )}

          {/* Payment Complete — funds remitted to doctor */}
          {!sessionLoading && activeSession !== null && activeSession.status === 'payment_complete' && (
            <View style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              backgroundColor: '#1C1C1E',
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingTop: 16, paddingHorizontal: 16,
              paddingBottom: whiteCardPaddingBottom,
              shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
              shadowOpacity: 0.08, shadowRadius: 10, elevation: 10,
            }}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 40, height: 5, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e', marginRight: 8 }} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#22c55e', fontFamily: 'Inter_600SemiBold' }}>Payment Complete</Text>
              </View>
              <Text style={{ fontSize: 44, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 4 }}>
                {'₦'}{(activeSession.price ?? 0).toLocaleString()}
              </Text>
              <Text style={{ fontSize: 14, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 16 }}>
                {'All done! Funds have been remitted to '}
                {activeSession.doctor_name ?? 'the doctor'}
                {"'s account."}
              </Text>
              <View style={{ backgroundColor: '#1A3A2A', borderRadius: 10, padding: 14 }}>
                <Text style={{ fontSize: 13, color: '#34C759', fontWeight: '500', fontFamily: 'Inter_600SemiBold' }}>{'✓ Payment Complete'}</Text>
                <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 4, fontFamily: 'Inter_400Regular' }}>
                  This coverage session is fully closed.
                </Text>
              </View>
            </View>
          )}

          {/* No active session — show search card */}
          {!sessionLoading && (activeSession === null ||
            activeSession.status === 'completed' ||
            activeSession.status === 'cancelled') && (
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
                    console.log('[RequesterHome] Date picker Done pressed');
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
                    console.log('[RequesterHome] Date picker changed:', event.type, date);
                    if (date) {
                      // WAT validation: snap back to today if before WAT today
                      const watTodayStr = watNow.toISOString().split('T')[0];
                      const selectedStr = date.toISOString().split('T')[0];
                      if (selectedStr < watTodayStr) {
                        const todayWAT = new Date(watNow);
                        todayWAT.setUTCHours(0, 0, 0, 0);
                        setShiftDate(todayWAT);
                      } else {
                        setShiftDate(date);
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
          console.log('[RequesterHome] Start time committed:', date.toTimeString().slice(0, 5));
          setStartTime(date);
          setShowStartTimePicker(false);
        }}
        onCancel={() => {
          console.log('[RequesterHome] Start time picker cancelled');
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
          console.log('[RequesterHome] End time committed:', date.toTimeString().slice(0, 5));
          setEndTime(date);
          setShowEndTimePicker(false);
        }}
        onCancel={() => {
          console.log('[RequesterHome] End time picker cancelled');
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
    </View>
  );
}

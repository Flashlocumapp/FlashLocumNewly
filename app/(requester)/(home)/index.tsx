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
import { Map, MapMarker } from '@/components/Map';
import { Search, MapPin, ArrowRight, X, History, ArrowLeft } from 'lucide-react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
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
  const canCancel = session.status === 'upcoming' && session.current_day === 1;
  const shiftPillText = buildShiftPillText(session);
  const rawDoctorName = session.doctor_name || '';
  // Strip any existing Dr. prefix then re-apply exactly once
  const cleanName = rawDoctorName.replace(/^dr\.?\s*/i, '').trim();
  const doctorName = cleanName && !cleanName.includes('@') ? `Dr. ${cleanName}` : 'Doctor';
  const initials = cleanName ? getSessionInitials(cleanName) : 'DR';
  const ratingRaw = Number(session.doctor_rating);
  const ratingDisplay = (!session.doctor_rating || isNaN(ratingRaw) || ratingRaw === 0) ? '5.0' : ratingRaw.toFixed(1);
  const reliabilityRaw = Number(session.doctor_reliability);
  const reliabilityDisplay = (!session.doctor_reliability || isNaN(reliabilityRaw) || reliabilityRaw === 0) ? '100' : String(Math.round(reliabilityRaw));

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
            <TouchableOpacity onPress={() => { console.log('[RequesterHome] Cancel shift pressed:', session.id); onCancel(); }}
              activeOpacity={0.8}
              style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }}>CANCEL SHIFT</Text>
            </TouchableOpacity>
          )}
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
          <TouchableOpacity onPress={() => { console.log('[RequesterHome] End shift pressed (paused):', session.id); onEndShift(); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#FF3B30', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>END SHIFT</Text>
          </TouchableOpacity>
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
  const ratingDisplay = (!session.doctor_rating || isNaN(ratingRaw) || ratingRaw === 0) ? '5.0' : ratingRaw.toFixed(1);
  const reliabilityRaw = Number(session.doctor_reliability);
  const reliabilityDisplay = (!session.doctor_reliability || isNaN(reliabilityRaw) || reliabilityRaw === 0) ? '100' : String(Math.round(reliabilityRaw));
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
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  // paymentConfirmed is now driven entirely by the parent via onPaymentConfirmed

  // Countdown state — recalculated from expiry_at, never persisted
  const [countdown, setCountdown] = useState('--:--');
  const [countdownColor, setCountdownColor] = useState('#000000');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryRef = useRef<string | null>(null);

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
        handleRefreshPayment();
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
    console.log('[RequesterPaymentCard] Fetching payment intent for session:', session.id);
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
        console.log('[RequesterPaymentCard] payment_intents query error:', error.message);
        setPaymentIntent(null);
      } else if (data) {
        console.log('[RequesterPaymentCard] Payment intent fetched:', data.id, 'expiry_at:', data.expiry_at);
        setPaymentIntent(data as import('@/types').PaymentIntent);
        startCountdown(data.expiry_at);
      }
    } catch (e: any) {
      console.log('[RequesterPaymentCard] fetchPaymentIntent exception:', e.message);
    } finally {
      setLoadingIntent(false);
    }
  }, [session.id, startCountdown]);

  // ─── Refresh payment via edge function ───────────────────────────────────
  const handleRefreshPayment = useCallback(async () => {
    if (refreshing) return;
    console.log('[RequesterPaymentCard] Calling refresh-payment edge function for session:', session.id);
    setRefreshing(true);
    try {
      const token = await getValidToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('https://juilousufwlsiqdcgllu.supabase.co/functions/v1/refresh-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: session.id }),
      });
      console.log('[RequesterPaymentCard] refresh-payment response status:', res.status);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.log('[RequesterPaymentCard] refresh-payment error:', errText);
        return;
      }
      const data = await res.json();
      const payment = data?.payment;
      console.log('[RequesterPaymentCard] refresh-payment success:', payment?.id, 'new expiry:', payment?.expiry_at);
      if (payment) {
        setPaymentIntent((prev) => prev ? {
          ...prev,
          id: payment.id ?? prev.id,
          amount_naira: payment.amount_naira ?? prev.amount_naira,
          monnify_account_number: payment.account_number ?? prev.monnify_account_number,
          monnify_bank_name: payment.bank_name ?? prev.monnify_bank_name,
          monnify_account_reference: payment.account_reference ?? prev.monnify_account_reference,
          expiry_at: payment.expiry_at ?? prev.expiry_at,
        } : prev);
        if (payment.expiry_at) {
          startCountdown(payment.expiry_at);
        }
      }
    } catch (e: any) {
      console.log('[RequesterPaymentCard] handleRefreshPayment exception:', e.message);
    } finally {
      setRefreshing(false);
    }
  }, [session.id, refreshing, startCountdown]);

  // ─── On mount: fetch intent + AppState foreground re-fetch ───────────────
  useEffect(() => {
    fetchPaymentIntent();

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[RequesterPaymentCard] App foregrounded — re-fetching payment intent');
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
          console.log('[RequesterPaymentCard] Mount check: session already paid, firing onPaymentConfirmed');
          if (timerRef.current) clearInterval(timerRef.current);
          onPaymentConfirmed();
        }
      } catch (e: any) {
        console.log('[RequesterPaymentCard] Mount check error:', e.message);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Realtime: session:<sessionId> — payment_refreshed only ─────────────
  // payment_confirmed / PAYMENT_CONFIRMED are handled by the parent's
  // requester-user channel and session channel; parent calls onPaymentConfirmed.
  useEffect(() => {
    const channelName = `session:${session.id}`;
    console.log('[RequesterPaymentCard] Subscribing to Realtime channel:', channelName);

    const ch = supabase.channel(channelName)
      .on('broadcast', { event: 'payment_refreshed' }, (payload) => {
        console.log('[RequesterPaymentCard] payment_refreshed received:', payload);
        const payment = payload?.payload?.payment;
        if (payment) {
          setPaymentIntent((prev) => prev ? {
            ...prev,
            id: payment.id ?? prev.id,
            amount_naira: payment.amount_naira ?? prev.amount_naira,
            monnify_account_number: payment.account_number ?? prev.monnify_account_number,
            monnify_bank_name: payment.bank_name ?? prev.monnify_bank_name,
            monnify_account_reference: payment.account_reference ?? prev.monnify_account_reference,
            expiry_at: payment.expiry_at ?? prev.expiry_at,
          } : prev);
          if (payment.expiry_at) {
            startCountdown(payment.expiry_at);
          }
        }
      })
      .subscribe((status) => {
        console.log('[RequesterPaymentCard] Realtime channel status:', channelName, status);
      });

    return () => {
      console.log('[RequesterPaymentCard] Unsubscribing from channel:', channelName);
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
    console.log('[RequesterPaymentCard] Copy account number pressed:', accountNumber);
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
              {loadingIntent ? 'Loading...' : (session.monnify_account_name ?? '—')}
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

// ─── PaymentSuccessModal ──────────────────────────────────────────────────────

interface PaymentSuccessModalProps {
  visible: boolean;
  session: CoverageSession | null;
  showRatingOverlay: boolean;
  ratingStars: number;
  ratingComment: string;
  submittingRating: boolean;
  ratingError: string;
  onDismiss: () => void;
  onRatingOverlayOpen: () => void;
  onRatingOverlayClose: () => void;
  onStarPress: (star: number) => void;
  onCommentChange: (text: string) => void;
  onSubmitRating: () => void;
  onSkipRating: () => void;
}

function PaymentSuccessModal({
  visible,
  session,
  showRatingOverlay,
  ratingStars,
  ratingComment,
  submittingRating,
  ratingError,
  onDismiss,
  onRatingOverlayOpen,
  onRatingOverlayClose,
  onStarPress,
  onCommentChange,
  onSubmitRating,
  onSkipRating,
}: PaymentSuccessModalProps) {
  const insets = useSafeAreaInsets();

  // Auto-show rating overlay 800ms after modal becomes visible
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      console.log('[PaymentSuccessModal] Auto-showing rating overlay');
      onRatingOverlayOpen();
    }, 800);
    return () => clearTimeout(timer);
  }, [visible, onRatingOverlayOpen]);

  if (!session) return null;

  const amountDisplay = `₦${Number(session.price).toLocaleString()}`;
  const reference = session.monnify_account_reference ?? '—';
  const endedDate = session.ended_at ? new Date(session.ended_at) : new Date();
  const dateDisplay = endedDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const timeDisplay = endedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const shiftStartDisplay = new Date(session.shift_start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const shiftEndDisplay = new Date(session.shift_end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const shiftDateDisplay = new Date(session.shift_date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  const doctorFirstName = (session.doctor_name ?? '').replace(/^Dr\.?\s*/i, '');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onDismiss}
    >
      <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
        {/* Close button */}
        <TouchableOpacity
          onPress={onDismiss}
          style={{
            position: 'absolute',
            top: insets.top + 16,
            right: 20,
            zIndex: 10,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#1C1C1E',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={18} color="#FFFFFF" />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 64,
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 40,
            alignItems: 'center',
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Green checkmark circle */}
          <View style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: '#1A3A2A',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}>
            <Text style={{ fontSize: 36, color: '#2DC653' }}>✓</Text>
          </View>

          {/* Title */}
          <Text style={{ fontSize: 28, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' }}>
            Payment Successful
          </Text>

          {/* Amount */}
          <Text style={{ fontSize: 44, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 24, textAlign: 'center', letterSpacing: -1 }}>
            {amountDisplay}
          </Text>

          {/* Reference row */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            marginBottom: 12,
          }}>
            <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>Reference</Text>
            <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', maxWidth: '65%', textAlign: 'right' }} numberOfLines={1}>
              {reference}
            </Text>
          </View>

          {/* Date & Time row */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            marginBottom: 32,
          }}>
            <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>Date & Time</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' }}>{dateDisplay}</Text>
              <Text style={{ fontSize: 13, color: '#8E8E93' }}>·</Text>
              <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' }}>{timeDisplay}</Text>
            </View>
          </View>

          {/* Shift Summary Card */}
          <View style={{
            width: '100%',
            backgroundColor: '#1C1C1E',
            borderRadius: 20,
            padding: 20,
            marginBottom: 32,
          }}>
            <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold', marginBottom: 12 }}>
              SHIFT SUMMARY
            </Text>
            <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 4 }}>
              {session.doctor_name}
            </Text>
            <Text style={{ fontSize: 14, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 12 }}>
              {session.coverage_type}
            </Text>
            <View style={{ height: 1, backgroundColor: '#2C2C2E', marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>{shiftDateDisplay}</Text>
              <Text style={{ fontSize: 13, color: '#3A3A3C' }}>·</Text>
              <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' }}>{shiftStartDisplay}</Text>
              <Text style={{ fontSize: 13, color: '#8E8E93' }}>–</Text>
              <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' }}>{shiftEndDisplay}</Text>
            </View>
          </View>

          {/* Rate Now button (shown when overlay was skipped) */}
          {!showRatingOverlay && (
            <TouchableOpacity
              onPress={() => {
                console.log('[PaymentSuccessModal] Rate Now button pressed');
                onRatingOverlayOpen();
              }}
              style={{
                width: '100%',
                backgroundColor: '#2DC653',
                borderRadius: 999,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>Rate Now</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Rating Overlay */}
        <Modal
          visible={showRatingOverlay}
          transparent
          animationType="fade"
          onRequestClose={onRatingOverlayClose}
        >
          <TouchableWithoutFeedback onPress={onRatingOverlayClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <View style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 24,
                    padding: 28,
                    width: '100%',
                  }}>
                    {/* Header */}
                    <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#1C1C1E', marginBottom: 6, textAlign: 'center' }}>
                      {'How was your experience with Dr. '}
                      {doctorFirstName}
                      {'?'}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 24 }}>
                      Share your feedback and help us improve.
                    </Text>

                    {/* Stars */}
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
                      {[1, 2, 3, 4, 5].map((star) => {
                        const filled = star <= ratingStars;
                        return (
                          <TouchableOpacity
                            key={star}
                            onPress={() => {
                              console.log('[PaymentSuccessModal] Star pressed:', star);
                              onStarPress(star);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 36, color: filled ? '#F4A261' : '#D4D4D8' }}>
                              {filled ? '★' : '☆'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Error */}
                    {ratingError !== '' && (
                      <Text style={{ fontSize: 12, color: '#FF3B30', textAlign: 'center', marginBottom: 8, fontFamily: 'Inter_400Regular' }}>
                        {ratingError}
                      </Text>
                    )}

                    {/* Comment */}
                    <TextInput
                      value={ratingComment}
                      onChangeText={onCommentChange}
                      placeholder="Write a comment (optional)..."
                      placeholderTextColor="#A1A1AA"
                      multiline
                      style={{
                        backgroundColor: '#F7F7F5',
                        borderRadius: 12,
                        padding: 14,
                        fontSize: 14,
                        fontFamily: 'Inter_400Regular',
                        color: '#1C1C1E',
                        minHeight: 80,
                        textAlignVertical: 'top',
                        marginBottom: 20,
                      }}
                    />

                    {/* Submit button */}
                    <TouchableOpacity
                      onPress={() => {
                        console.log('[PaymentSuccessModal] Submit Review pressed, stars:', ratingStars);
                        onSubmitRating();
                      }}
                      disabled={submittingRating}
                      style={{
                        backgroundColor: '#1C1C1E',
                        borderRadius: 999,
                        paddingVertical: 16,
                        alignItems: 'center',
                        marginBottom: 12,
                        opacity: submittingRating ? 0.6 : 1,
                      }}
                    >
                      {submittingRating ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>Submit Review</Text>
                      )}
                    </TouchableOpacity>

                    {/* Skip */}
                    <TouchableOpacity
                      onPress={() => {
                        console.log('[PaymentSuccessModal] Skip rating pressed');
                        onSkipRating();
                      }}
                      style={{ alignItems: 'center', paddingVertical: 8 }}
                    >
                      <Text style={{ fontSize: 14, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function RequesterHomeScreen() {
  const insets = useSafeAreaInsets();
  const { setTabBarVisible } = useTabBarVisibility();
  const { user } = useAuth();

  // Live requester scores — baseline 5.0 / 100%
  const [requesterRating, setRequesterRating] = useState<number>(5.0);
  const [requesterReliability, setRequesterReliability] = useState<number>(100);

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
          console.log('[RequesterHome] Failed to fetch requester scores:', error.message);
          return;
        }
        if (data) {
          console.log('[RequesterHome] Fetched requester scores:', data.rating, data.reliability);
          setRequesterRating(data.rating ?? 5.0);
          setRequesterReliability(data.reliability ?? 100);
        }
      } catch (e: any) {
        console.log('[RequesterHome] fetchRequesterScores error:', e.message);
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
        console.log('[RequesterHome] RATING_UPDATED received:', JSON.stringify(payload));
        if (payload?.payload?.reviewer_role === 'doctor') {
          const newRating = payload?.payload?.new_rating;
          if (newRating !== undefined) {
            console.log('[RequesterHome] Updating requester rating to:', newRating);
            setRequesterRating(newRating);
          }
        }
      })
      .on('broadcast', { event: 'RELIABILITY_UPDATED' }, (payload) => {
        console.log('[RequesterHome] RELIABILITY_UPDATED received:', JSON.stringify(payload));
        const newReliability = payload?.payload?.new_reliability;
        if (newReliability !== undefined) {
          console.log('[RequesterHome] Updating requester reliability to:', newReliability);
          setRequesterReliability(newReliability);
        }
      })
      // From channel 6 (payment confirmed on user channel)
      .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
        console.log('[RequesterHome] payment_confirmed received (user channel):', payload);
        setActiveSession((prev) => {
          if (prev) { setConfirmedSession(prev); setShowPaymentSuccess(true); }
          return null;
        });
        fetchActiveSession();
      })
      .on('broadcast', { event: 'PAYMENT_CONFIRMED' }, (payload) => {
        console.log('[RequesterHome] PAYMENT_CONFIRMED received (user channel):', payload);
        setActiveSession((prev) => {
          if (prev) { setConfirmedSession(prev); setShowPaymentSuccess(true); }
          return null;
        });
        fetchActiveSession();
      })
      // From channel 7 (shift cancelled on requester channel)
      .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
        console.log('[RequesterHome] SHIFT_CANCELLED received (requester channel):', payload);
        setActiveSession(null);
      })
      .subscribe((status) => {
        console.log('[RequesterHome] requester-user channel status:', status);
      });
    return () => { supabase.removeChannel(ch); };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapRef = useRef<any>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [onlineDoctors, setOnlineDoctors] = useState<{ id: string; lat: number; lng: number }[]>([]);

  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const hasInitialFix = useRef(false);

  // ── Online doctors realtime ──
  useEffect(() => {
    if (!user) return;

    const fetchOnlineDoctors = async () => {
      const { data, error } = await supabase
        .from('doctor_profiles')
        .select('id, lat, lng')
        .eq('is_online', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null);
      if (error) {
        console.log('[RequesterHome] fetchOnlineDoctors error:', error.message);
        return;
      }
      console.log('[RequesterHome] Online doctors fetched:', data?.length ?? 0);
      setOnlineDoctors((data ?? []) as { id: string; lat: number; lng: number }[]);
    };

    fetchOnlineDoctors();

    const ch = supabase
      .channel('online-doctors')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'doctor_profiles' },
        (payload) => {
          console.log('[RequesterHome] doctor_profiles change:', payload.eventType, payload.new);
          const row = payload.new as { id: string; lat?: number; lng?: number; is_online?: boolean } | null;
          if (!row) {
            if (payload.old) {
              setOnlineDoctors((prev) => prev.filter((d) => d.id !== (payload.old as any).id));
            }
            return;
          }
          if (row.is_online && row.lat != null && row.lng != null) {
            setOnlineDoctors((prev) => {
              const filtered = prev.filter((d) => d.id !== row.id);
              return [...filtered, { id: row.id, lat: row.lat!, lng: row.lng! }];
            });
          } else {
            setOnlineDoctors((prev) => prev.filter((d) => d.id !== row.id));
          }
        }
      )
      .subscribe((status) => {
        console.log('[RequesterHome] online-doctors channel status:', status);
      });

    return () => { supabase.removeChannel(ch); };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [activeSession, setActiveSession] = useState<CoverageSession | null>(null);
  const isFirstLoadRef = useRef(true);
  const [sessionLoading, setSessionLoading] = useState(false); // kept for any remaining uses but never set true again after first load
  // Stable session ID — only set when a real ID arrives, never cleared when session becomes null.
  // This prevents the session channel from re-subscribing to 'session:undefined' after payment_confirmed.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Post-payment success state
  const [confirmedSession, setConfirmedSession] = useState<CoverageSession | null>(null);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [showRatingOverlay, setShowRatingOverlay] = useState(false);
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
      // If session is already paid and we haven't shown the modal yet, show it now
      // (handles the case where the app was backgrounded during payment)
      if (session && session.status === 'requester_paid') {
        setConfirmedSession((prev) => {
          if (!prev) {
            // Only show if not already showing
            setShowPaymentSuccess(true);
            return session;
          }
          return prev;
        });
      }
    } catch (e: any) {
      console.log('[RequesterHome] fetchActiveSession error:', e.message);
    } finally {
      isFirstLoadRef.current = false;
      setSessionLoading(false);
    }
  }, []);

  // ─── Keep activeSessionId in sync — only set, never clear ───────────────────
  useEffect(() => {
    if (activeSession?.id) {
      console.log('[RequesterHome] activeSessionId updated to:', activeSession.id);
      setActiveSessionId(activeSession.id);
    }
    // Intentionally do NOT clear when activeSession becomes null —
    // this keeps the session channel alive after payment_confirmed fires.
  }, [activeSession?.id]);

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
    if (!activeSessionId) {
      if (sessionChannelRef.current) {
        console.log('[RequesterHome] No active session ID — removing session channel');
        supabase.removeChannel(sessionChannelRef.current);
        sessionChannelRef.current = null;
      }
      return;
    }

    const channelName = `session:${activeSessionId}`;
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
        setActiveSession((prev) => {
          if (prev) {
            setConfirmedSession(prev);
            setShowPaymentSuccess(true);
          }
          return null;
        });
        fetchActiveSession(); // backstop: if prev was null, fetch finds requester_paid and triggers modal
      })
      .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
        console.log('[RequesterHome] payment_confirmed received (session channel):', payload);
        setActiveSession((prev) => {
          if (prev) {
            setConfirmedSession(prev);
            setShowPaymentSuccess(true);
          }
          return null;
        });
        fetchActiveSession(); // backstop: if prev was null, fetch finds requester_paid and triggers modal
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
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Channels 6 and 7 merged into requester-user channel above

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
            });
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
          shouldPollRef.current = false;
          if (pollIntervalRef.current) {
            console.log('[RequesterHome] MATCH_CONFIRMED — clearing poll timeout');
            clearTimeout(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
          console.log('[RequesterHome] MATCH_CONFIRMED — fetching active session and resetting to idle');
          fetchActiveSessionRef.current();
          transitionToRef.current('idle');
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
          transitionToRef.current('summary');
        })
        .subscribe((status) => {
          console.log('[RequesterHome] Realtime channel status:', channelName, status);
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
            console.log('[RequesterHome] Mount check: already matched, transitioning to idle');
            shouldPollRef.current = false;
            if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
            fetchActiveSessionRef.current();
            transitionToRef.current('idle');
          }
        } catch (e: any) {
          console.log('[RequesterHome] Mount check error:', e.message);
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
              fetchActiveSessionRef.current();
              transitionToRef.current('idle');
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
      console.log('[RequesterHome] Fetching price preview — coverage_type:', coverageType, 'shift_type:', shiftType, 'environment:', environment, 'duration_hours:', durationHours);
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
  const [showCancelActiveModal, setShowCancelActiveModal] = useState(false);
  const [showCancelActiveReasons, setShowCancelActiveReasons] = useState(false);
  const [showEndShiftModal, setShowEndShiftModal] = useState(false);
  const [showPauseShiftModal, setShowPauseShiftModal] = useState(false);

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

  const handlePaymentConfirmed = useCallback(() => {
    console.log('[RequesterHome] Payment confirmed — snapshotting session and showing success modal');
    setActiveSession((prev) => {
      if (prev) {
        setConfirmedSession(prev);
        setShowPaymentSuccess(true);
      }
      return null;
    });
  }, []); // no deps — uses functional setState so never goes stale

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
    console.log('[RequesterHome] Pause shift — showing confirmation modal');
    setShowPauseShiftModal(true);
  }, [activeSession]);

  const handleConfirmPauseShift = async () => {
    if (!activeSession) return;
    setShowPauseShiftModal(false);
    console.log('[RequesterHome] Pause shift confirmed for session:', activeSession.id);
    try {
      const data = await callSessionEdge('pause-shift', activeSession.id);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      console.log('[RequesterHome] Pause shift error:', e.message);
      Alert.alert('Pause Shift Failed', e.message || 'Something went wrong. Please try again.');
    }
  };

  const handleEndShift = useCallback(async () => {
    if (!activeSession) return;
    console.log('[RequesterHome] End shift — showing confirmation modal');
    setShowEndShiftModal(true);
  }, [activeSession]);

  const handleConfirmEndShift = async () => {
    if (!activeSession) return;
    setShowEndShiftModal(false);
    console.log('[RequesterHome] End shift confirmed for session:', activeSession.id);
    try {
      const data = await callSessionEdge('end-shift', activeSession.id);
      const updated = data?.session as Partial<CoverageSession>;
      if (updated) setActiveSession((prev) => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      console.log('[RequesterHome] End shift error:', e.message);
      Alert.alert('End Shift Failed', e.message || 'Something went wrong. Please try again.');
    }
  };

  const handleCancelActiveShift = useCallback(() => {
    if (!activeSession) return;
    console.log('[RequesterHome] Cancel active shift — showing confirmation modal');
    setShowCancelActiveModal(true);
  }, [activeSession]);

  const handleConfirmCancelActive = () => {
    setShowCancelActiveModal(false);
    setShowCancelActiveReasons(true);
  };

  const handleCancelActiveReasonSelected = async (reason: string) => {
    if (!activeSession) return;
    console.log('[RequesterHome] Cancel active shift reason selected:', reason);
    setShowCancelActiveReasons(false);
    try {
      const token = await getValidToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${EDGE_BASE}/update-shift-status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSession.id, status: 'cancelled', cancellation_reason: reason }),
      });
      console.log('[RequesterHome] Cancel active shift response:', res.status);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || 'Cancel failed');
      }
      setActiveSession(null);
    } catch (e: any) {
      console.log('[RequesterHome] Cancel active shift error:', e.message);
      Alert.alert('Error', e.message);
    }
  };

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
  return (
    <View style={{ flex: 1, backgroundColor: '#F9F9F6' }}>

      {/* ── FULL-SCREEN MAP (always behind everything) ── */}
      <Map
        style={StyleSheet.absoluteFillObject}
        initialRegion={LAGOS_REGION}
        markers={[
          ...(userCoords ? [{ id: 'user', latitude: userCoords.latitude, longitude: userCoords.longitude, title: 'You' } as MapMarker] : []),
          ...onlineDoctors.map((doc) => ({ id: doc.id, latitude: doc.lat, longitude: doc.lng, title: 'Doctor' } as MapMarker)),
        ]}
      />



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

          {/* Settled — payment received, awaiting doctor bank remittance */}
          {activeSession !== null && activeSession.status === 'settled' && (
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
          {activeSession !== null && activeSession.status === 'payment_complete' && (
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
          {(activeSession === null ||
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
                {/* Requester scores row */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 13, color: '#F4A261', fontFamily: 'Inter_600SemiBold' }}>
                    {'★ '}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#F4A261', fontFamily: 'Inter_600SemiBold' }}>
                    {requesterRating.toFixed(1)}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#8E8E93', marginHorizontal: 6 }}>{'·'}</Text>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759', marginRight: 4 }} />
                  <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>
                    {requesterReliability.toFixed(0)}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{'%'}</Text>
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

      {/* ── PAYMENT SUCCESS MODAL ── */}
      <PaymentSuccessModal
        visible={showPaymentSuccess}
        session={confirmedSession}
        showRatingOverlay={showRatingOverlay}
        ratingStars={ratingStars}
        ratingComment={ratingComment}
        submittingRating={submittingRating}
        ratingError={ratingError}
        onDismiss={() => {
          console.log('[RequesterHome] Payment success modal dismissed');
          setShowPaymentSuccess(false);
          setConfirmedSession(null);
          setShowRatingOverlay(false);
          setRatingStars(0);
          setRatingComment('');
          setRatingError('');
        }}
        onRatingOverlayOpen={() => {
          console.log('[RequesterHome] Rating overlay opened');
          setShowRatingOverlay(true);
        }}
        onRatingOverlayClose={() => {
          console.log('[RequesterHome] Rating overlay closed without submitting');
          setShowRatingOverlay(false);
        }}
        onStarPress={(star) => {
          console.log('[RequesterHome] Star rating selected:', star);
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
          console.log('[RequesterHome] Submitting review for session:', confirmedSession.id, 'stars:', ratingStars);
          setSubmittingRating(true);
          setRatingError('');
          try {
            const token = await getValidToken();
            const res = await fetch(`${EDGE_BASE}/submit-review`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: confirmedSession.id, stars: ratingStars, comment: ratingComment || undefined, reviewer_role: 'requester' }),
            });
            console.log('[RequesterHome] submit-review response:', res.status);
            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}));
              throw new Error((errBody as any).error || 'Failed to submit review');
            }
            const data = await res.json();
            console.log('[RequesterHome] Review submitted successfully:', data?.review?.id);
            setShowRatingOverlay(false);
          } catch (e: any) {
            console.log('[RequesterHome] Review submission error:', e.message);
            setRatingError(e.message || 'Failed to submit review');
          } finally {
            setSubmittingRating(false);
          }
        }}
        onSkipRating={() => {
          console.log('[RequesterHome] Rating skipped');
          setShowRatingOverlay(false);
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
                This will end the current shift and trigger the payment process.
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
                The shift timer will be paused. You can resume it at any time.
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
    </View>
  );
}

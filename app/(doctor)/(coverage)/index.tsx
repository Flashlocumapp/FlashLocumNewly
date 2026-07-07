import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
  Switch,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { supabase, getValidToken } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { CoverageSession } from '@/contexts/DoctorDispatchContext';
import { useTabData } from '@/hooks/useTabData';
import { invalidate } from '@/utils/tabCache';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SUPABASE_URL = 'https://juilousufwlsiqdcgllu.supabase.co';

const TABS = ['Upcoming', 'History'] as const;
type TabType = typeof TABS[number];

function getDoctorInitials(name: string): string {
  const parts = name.replace(/^Dr\.?\s*/i, '').trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? '?';
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={{ alignItems: 'center', marginTop: SPACING.xxxl }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: RADIUS.full,
          backgroundColor: '#EBEBEB',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: SPACING.base,
        }}
      >
        <Clock size={28} color={COLORS.textTertiary} />
      </View>
      <Text style={[TYPOGRAPHY.body, { color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: SPACING.xl }]}>
        {message}
      </Text>
    </View>
  );
}

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [opacity]);
  return (
    <Animated.View style={{ opacity, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 12 }}>
      <View style={{ width: '60%', height: 16, borderRadius: 8, backgroundColor: '#E5E5E5', marginBottom: 8 }} />
      <View style={{ width: '40%', height: 12, borderRadius: 6, backgroundColor: '#E5E5E5', marginBottom: 6 }} />
      <View style={{ width: '80%', height: 12, borderRadius: 6, backgroundColor: '#E5E5E5' }} />
    </Animated.View>
  );
}

function buildShiftPillText(session: CoverageSession): string {
  const shiftMs = new Date(session.shift_end).getTime() - new Date(session.shift_start).getTime();
  const msHours = shiftMs / (1000 * 60 * 60);
  const shiftHours = (session.per_day_hours && Number(session.per_day_hours) > 0)
    ? Number(session.per_day_hours)
    : (msHours > 0 ? msHours : 24);
  const totalHours = shiftHours * session.coverage_length;
  const hoursDisplay = totalHours % 1 === 0 ? `${totalHours}hr` : `${totalHours.toFixed(1)}hr`;
  const priceDisplay = `₦${Number(session.price).toLocaleString()}`;
  const shiftStart = formatTime(session.shift_start);
  const shiftEnd = formatTime(session.shift_end);
  const sep = ' ● ';

  if (session.status === 'paused') {
    return `${session.shift_type}${sep}Day ${session.current_day} of ${session.coverage_length}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
  }

  if (shiftHours >= 24) {
    const startDate = new Date(session.shift_date);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    const startDay = startDate.toLocaleDateString('en-US', { weekday: 'short' });
    const endDay = endDate.toLocaleDateString('en-US', { weekday: 'short' });
    return `${session.shift_type}${sep}${startDay} - ${endDay}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
  }

  if (session.coverage_length > 1) {
    const startDate = new Date(session.shift_date);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + session.coverage_length - 1);
    const startDay = startDate.toLocaleDateString('en-US', { weekday: 'short' });
    const endDay = endDate.toLocaleDateString('en-US', { weekday: 'short' });
    return `${session.shift_type}${sep}${startDay} - ${endDay}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
  }

  const dayLabel = new Date(session.shift_date).toLocaleDateString('en-US', { weekday: 'short' });
  return `${session.shift_type}${sep}${dayLabel}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
}

function EnvironmentBadge({ environment }: { environment: string }) {
  const bg = '#F5F5F0';
  const color = '#1C1C1E';
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontSize: 12, color, fontFamily: 'Inter_600SemiBold' }}>{environment}</Text>
    </View>
  );
}

function UpcomingCoverageCard({ session, onCall, onCancel }: {
  session: CoverageSession;
  onCall: (session: CoverageSession) => void;
  onCancel: (session: CoverageSession) => void;
}) {
  const ratingDisplay = Number(session.doctor_rating ?? 0).toFixed(1);
  const reliabilityDisplay = Math.round(Number(session.doctor_reliability ?? 100));
  const shiftPillText = buildShiftPillText(session);
  const canCancel = session.status === 'upcoming';

  const statusLabel = session.status === 'paused' ? 'PAUSED COVERAGE' : session.status === 'payment_pending' ? 'PAYMENT PENDING' : 'UPCOMING COVERAGE';

  return (
    <View style={{
      backgroundColor: '#2C2C2E',
      borderRadius: 20,
      padding: 16,
      marginBottom: 12,
      ...(Platform.OS === 'ios'
        ? { boxShadow: '0 2px 8px rgba(0,0,0,0.18)' } as any
        : { elevation: 4 }),
    }}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold' }}>
          {statusLabel}
        </Text>
        <EnvironmentBadge environment={session.environment ?? 'Normal'} />
      </View>

      {/* Hospital name + rating row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFFFFF', flexShrink: 1 }} numberOfLines={1}>
          {session.hospital_name}
        </Text>
        <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginHorizontal: 6 }}>{'|'}</Text>
        <Text style={{ fontSize: 13, color: '#F4A261', fontFamily: 'Inter_400Regular' }}>{'★ '}</Text>
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{ratingDisplay}</Text>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#34C759', marginHorizontal: 6 }} />
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{reliabilityDisplay}{'%'}</Text>
      </View>

      {/* Address */}
      <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' }} numberOfLines={1}>
        {session.hospital_address}
      </Text>

      {/* Shift pill */}
      <View style={{ backgroundColor: '#3A3A3C', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 8 }}>
        <Text style={{ fontSize: 12, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }} numberOfLines={1}>
          {shiftPillText}
        </Text>
      </View>

      {/* Payment pending banner */}
      {session.status === 'payment_pending' && (
        <View style={{ backgroundColor: '#3A2A00', borderRadius: 10, padding: 12, marginTop: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#D97706', fontFamily: 'Inter_600SemiBold' }}>{'⏳ Waiting for Payment'}</Text>
          <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 4, fontFamily: 'Inter_400Regular' }}>
            The requester has been sent a payment request. You will be notified once payment is confirmed.
          </Text>
        </View>
      )}

      {/* Action buttons */}
      {session.status !== 'payment_pending' && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {canCancel && (
            <TouchableOpacity
              onPress={() => {
                console.log('[DoctorCoverage] UpcomingCard cancel pressed:', session.id);
                onCancel(session);
              }}
              activeOpacity={0.8}
              style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E', letterSpacing: 0.3 }}>CANCEL SHIFT</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              console.log('[DoctorCoverage] UpcomingCard call pressed:', session.id);
              onCall(session);
            }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#1C1C1E', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF', letterSpacing: 0.3 }}>CALL</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

interface DoctorCardProps {
  session: CoverageSession;
  onCall: (session: CoverageSession) => void;
  onCancel: (session: CoverageSession) => void;
  isHistory?: boolean;
}

function DoctorCard({ session, onCall, onCancel, isHistory }: DoctorCardProps) {
  const shiftStart = formatTime(session.shift_start);
  const shiftEnd = formatTime(session.shift_end);

  const coverageLength = Math.max(1, session.coverage_length ?? 1);
  const startDate = session.shift_date ? new Date(session.shift_date + 'T12:00:00') : null;
  const dayLabel = startDate ? startDate.toLocaleDateString('en-US', { weekday: 'short' }) : '';

  let shiftSummary: string;
  if (session.status === 'paused') {
    shiftSummary = `${session.shift_type} · Day ${session.current_day} of ${coverageLength} · ${shiftStart} – ${shiftEnd}`;
  } else if (coverageLength > 1) {
    const endDate = startDate ? new Date(startDate) : null;
    if (endDate) endDate.setDate(endDate.getDate() + coverageLength - 1);
    const endDay = endDate ? endDate.toLocaleDateString('en-US', { weekday: 'short' }) : '';
    shiftSummary = `${session.shift_type} · ${dayLabel} - ${endDay} · ${shiftStart} – ${shiftEnd} · Day ${session.current_day} of ${coverageLength}`;
  } else {
    shiftSummary = `${session.shift_type} · ${dayLabel} · ${shiftStart} – ${shiftEnd}`;
  }

  const initials = getDoctorInitials(session.doctor_name || 'Doctor');
  const ratingDisplay = Number(session.doctor_rating).toFixed(1);
  const reliabilityDisplay = Math.round(Number(session.doctor_reliability));

  return (
    <View
      style={[
        {
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          marginBottom: 12,
          overflow: 'hidden',
          opacity: isHistory ? 0.7 : 1,
        },
        Platform.OS === 'ios'
          ? { boxShadow: '0 2px 8px rgba(0,0,0,0.07)' } as any
          : { elevation: 3 },
      ]}
    >
      <View style={{ padding: 16 }}>
        {/* Avatar row */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ marginRight: 12 }}>
            <View style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: '#2C2C2E',
              alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {session.doctor_avatar ? (
                <Image source={{ uri: session.doctor_avatar }} style={{ width: 52, height: 52, borderRadius: 26 }} />
              ) : (
                <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>
                  {initials}
                </Text>
              )}
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }} numberOfLines={1}>
              {session.doctor_name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#71717A' }}>
                {session.doctor_mdcn || 'MDCN/R/—'}
              </Text>
              <Text style={{ color: '#D4D4D8', fontSize: 12 }}>·</Text>
              <Text style={{ fontSize: 12, color: '#F4A261' }}>★</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#F4A261' }}>{ratingDisplay}</Text>
              <Text style={{ color: '#D4D4D8', fontSize: 12 }}>·</Text>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#2DC653' }} />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#2DC653' }}>{reliabilityDisplay}%</Text>
            </View>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#71717A', marginTop: 3 }} numberOfLines={1}>
              {shiftSummary}
            </Text>
          </View>
        </View>

        {/* History ended_at */}
        {isHistory && session.ended_at && (
          <Text style={{ fontSize: 12, color: '#A1A1AA', marginTop: 8 }}>
            {'Ended: '}{new Date(session.ended_at).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        )}

        {/* Payment pending status banner */}
        {!isHistory && session.status === 'payment_pending' && (
          <View style={{ backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, marginTop: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#D97706', fontFamily: 'Inter_600SemiBold' }}>{'⏳ Waiting for Payment'}</Text>
            <Text style={{ fontSize: 12, color: '#71717A', marginTop: 4, fontFamily: 'Inter_400Regular' }}>
              The requester has been sent a payment request. You will be notified once payment is confirmed.
            </Text>
          </View>
        )}

        {/* Settled status banner */}
        {!isHistory && session.status === 'settled' && (
          <View style={{ backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginTop: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#15803d', fontFamily: 'Inter_600SemiBold' }}>{'✓ Requester Paid'}</Text>
            <Text style={{ fontSize: 12, color: '#71717A', marginTop: 4, fontFamily: 'Inter_400Regular' }}>
              {'Payment of ₦'}{(session.price ?? 0).toLocaleString()}{' confirmed. Funds are being remitted to your account.'}
            </Text>
          </View>
        )}

        {/* Payment complete status banner */}
        {!isHistory && session.status === 'payment_complete' && (
          <View style={{ backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginTop: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#15803d', fontFamily: 'Inter_600SemiBold' }}>{'✓ Payment Received'}</Text>
            <Text style={{ fontSize: 12, color: '#71717A', marginTop: 4, fontFamily: 'Inter_400Regular' }}>
              {'₦'}{(session.price ?? 0).toLocaleString()}{' has been remitted to your bank account.'}
            </Text>
          </View>
        )}

        {/* Action buttons — all non-history sessions */}
        {!isHistory && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {(session.status === 'upcoming' || session.status === 'paused' || session.status === 'payment_pending') && (
              <TouchableOpacity onPress={() => {
                console.log('[DoctorCoverage] Call requester pressed:', session.id, 'status:', session.status);
                onCall(session);
              }} activeOpacity={0.8}
                style={{ flex: 1, borderWidth: 1.5, borderColor: '#1C1C1E', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#1C1C1E', letterSpacing: 0.3 }}>CALL</Text>
              </TouchableOpacity>
            )}
            {session.status === 'upcoming' && (
              <TouchableOpacity onPress={() => {
                console.log('[DoctorCoverage] Cancel shift pressed:', session.id);
                onCancel(session);
              }} activeOpacity={0.8}
                style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#DC2626', letterSpacing: 0.3 }}>CANCEL</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export default function DoctorCoverageScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('Upcoming');
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  const upcomingKey = `doctor-coverage-upcoming-${user?.id ?? 'anon'}`;
  const historyKey = `doctor-coverage-history-${user?.id ?? 'anon'}`;

  const getAccessToken = useCallback(async () => getValidToken(), []);

  const {
    data: upcomingData,
    loading: upcomingLoading,
    refreshing: upcomingRefreshing,
    refresh: refreshUpcoming,
  } = useTabData<CoverageSession[]>({
    cacheKey: upcomingKey,
    fetcher: async () => {
      console.log('[DoctorCoverage] Fetching upcoming sessions');
      const token = await getAccessToken();
      if (!token) {
        console.log('[DoctorCoverage] No access token available');
        return [];
      }
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=doctor&status=upcoming,paused,payment_pending,settled,payment_complete`,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      if (!res.ok) {
        const errText = await res.text();
        console.log('[DoctorCoverage] Upcoming fetch error:', res.status, errText);
        throw new Error('Failed to load upcoming sessions');
      }
      const data = await res.json();
      console.log('[DoctorCoverage] Upcoming sessions fetched:', data?.sessions?.length ?? 0);
      return data?.sessions ?? [];
    },
    alwaysRefresh: true,
  });

  const {
    data: historyData,
    loading: historyLoading,
    refreshing: historyRefreshing,
  } = useTabData<CoverageSession[]>({
    cacheKey: historyKey,
    fetcher: async () => {
      console.log('[DoctorCoverage] Fetching history sessions');
      const token = await getAccessToken();
      if (!token) {
        console.log('[DoctorCoverage] No access token available');
        return [];
      }
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=doctor&status=completed,cancelled,requester_paid`,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      if (!res.ok) {
        const errText = await res.text();
        console.log('[DoctorCoverage] History fetch error:', res.status, errText);
        throw new Error('Failed to load history sessions');
      }
      const data = await res.json();
      console.log('[DoctorCoverage] History sessions fetched:', data?.sessions?.length ?? 0);
      return data?.sessions ?? [];
    },
    alwaysRefresh: true,
  });

  // Local mutable state for realtime updates on top of cached data
  const [upcomingSessions, setUpcomingSessions] = useState<CoverageSession[]>([]);
  const [historySessions, setHistorySessions] = useState<CoverageSession[]>([]);

  // Sync fetched data into local state
  useEffect(() => {
    if (upcomingData) setUpcomingSessions(upcomingData);
  }, [upcomingData]);

  useEffect(() => {
    if (historyData) setHistorySessions(historyData);
  }, [historyData]);

  const updateSessionStatus = useCallback(async (sessionId: string, status: string) => {
    console.log('[DoctorCoverage] Updating session status:', sessionId, '->', status);
    const token = await getAccessToken();
    if (!token) return false;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/update-shift-status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, status }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.log('[DoctorCoverage] Status update error:', res.status, errText);
      return false;
    }
    console.log('[DoctorCoverage] Status update success:', sessionId, status);
    return true;
  }, [getAccessToken]);

  const handleStatusChange = useCallback((sessionId: string, newStatus: CoverageSession['status']) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const removeFromList = (list: CoverageSession[]) =>
      list.filter(s => s.id !== sessionId);

    if (newStatus === 'completed' || newStatus === 'cancelled') {
      setUpcomingSessions(prev => {
        const found = prev.find(s => s.id === sessionId);
        if (found) {
          setHistorySessions(hist => [{ ...found, status: newStatus }, ...hist]);
          // Invalidate cache so next visit re-fetches
          invalidate(upcomingKey);
          invalidate(historyKey);
          return removeFromList(prev);
        }
        return prev;
      });
    }
  }, [upcomingKey, historyKey]);

  const setupRealtimeSubscriptions = useCallback((sessions: CoverageSession[], userId: string) => {
    channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    channelsRef.current = [];

    sessions.forEach(session => {
      const ch = supabase
        .channel(`coverage:${session.id}`)
        .on('broadcast', { event: 'STATUS_CHANGED' }, (payload) => {
          console.log('[DoctorCoverage] Realtime STATUS_CHANGED:', session.id, payload);
          const newStatus = payload?.payload?.status as CoverageSession['status'];
          if (newStatus) handleStatusChange(session.id, newStatus);
        })
        .subscribe();
      channelsRef.current.push(ch);
    });

    const doctorCh = supabase
      .channel(`doctor:${userId}`)
      .on('broadcast', { event: 'SESSION_CREATED' }, (payload) => {
        console.log('[DoctorCoverage] Realtime SESSION_CREATED:', payload);
        const newSession = payload?.payload?.session as CoverageSession;
        if (newSession) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setUpcomingSessions(prev => [newSession, ...prev]);
          invalidate(upcomingKey);
        }
      })
      .on('broadcast', { event: 'SHIFT_PAUSED' }, (payload) => {
        console.log('[DoctorCoverage] Realtime SHIFT_PAUSED:', payload);
        const updatedSession = payload?.payload?.session as CoverageSession;
        if (updatedSession) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setUpcomingSessions(prev => {
            const exists = prev.find(s => s.id === updatedSession.id);
            if (exists) return prev.map(s => s.id === updatedSession.id ? updatedSession : s);
            return [updatedSession, ...prev];
          });
        }
      })
      .on('broadcast', { event: 'SHIFT_STARTED' }, (payload) => {
        console.log('[DoctorCoverage] Realtime SHIFT_STARTED:', payload);
        const sessionId = payload?.payload?.session?.id;
        if (sessionId) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setUpcomingSessions(prev => prev.filter(s => s.id !== sessionId));
        }
      })
      .on('broadcast', { event: 'SHIFT_ENDED' }, (payload) => {
        console.log('[DoctorCoverage] Realtime SHIFT_ENDED:', payload);
        const updatedSession = payload?.payload?.session as CoverageSession;
        if (updatedSession) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setUpcomingSessions(prev => prev.map(s => s.id === updatedSession.id ? { ...s, ...updatedSession } : s));
        }
      })
      .on('broadcast', { event: 'PAYMENT_CONFIRMED' }, (payload) => {
        console.log('[DoctorCoverage] Realtime PAYMENT_CONFIRMED:', payload);
        const sessionId = payload?.payload?.session_id as string ?? payload?.payload?.session?.id as string;
        if (sessionId) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setUpcomingSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: 'settled' as const } : s));
        }
      })
      .on('broadcast', { event: 'PAYMENT_COMPLETE' }, (payload) => {
        console.log('[DoctorCoverage] Realtime PAYMENT_COMPLETE:', payload);
        const sessionId = payload?.payload?.session_id as string ?? payload?.payload?.session?.id as string;
        if (sessionId) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setUpcomingSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: 'payment_complete' as const } : s));
        }
      })
      .subscribe();
    channelsRef.current.push(doctorCh);
  }, [handleStatusChange, upcomingKey]);

  useEffect(() => {
    if (!user?.id) return;
    setupRealtimeSubscriptions(upcomingSessions, user.id);
  }, [upcomingSessions, user?.id, setupRealtimeSubscriptions]);

  useEffect(() => {
    return () => {
      console.log('[DoctorCoverage] Cleaning up realtime channels');
      channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    };
  }, []);

  const handleCall = useCallback((session: CoverageSession) => {
    console.log('[DoctorCoverage] Call action:', session.id, 'phone:', session.requester_phone);
    if (!session.requester_phone) {
      Alert.alert('No phone number available');
      return;
    }
    Linking.openURL(`tel:${session.requester_phone}`);
  }, []);

  const handleCancel = useCallback((session: CoverageSession) => {
    console.log('[DoctorCoverage] Cancel action initiated:', session.id);
    Alert.alert('Cancel Shift?', 'This will cancel the booking.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Shift',
        style: 'destructive',
        onPress: async () => {
          console.log('[DoctorCoverage] Cancel confirmed:', session.id);
          const ok = await updateSessionStatus(session.id, 'cancelled');
          if (ok) handleStatusChange(session.id, 'cancelled');
        },
      },
    ]);
  }, [updateSessionStatus, handleStatusChange]);

  const isHistoryTab = activeTab === 'History';
  const currentSessions = isHistoryTab ? historySessions : upcomingSessions;
  const currentLoading = isHistoryTab ? historyLoading : upcomingLoading;
  const currentRefreshing = isHistoryTab ? historyRefreshing : upcomingRefreshing;
  const emptyMessage = isHistoryTab
    ? 'No past coverage yet.'
    : 'No upcoming shifts. Stay online to receive requests.';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F7F7F5' }}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: SPACING.base,
        paddingBottom: 120,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[TYPOGRAPHY.h1, { color: COLORS.text, marginBottom: 4 }]}>
        Coverage
      </Text>
      <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginBottom: SPACING.xl }]}>
        Your operational coverage
      </Text>

      {/* Switch tab selector */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.xxl,
        gap: 12,
      }}>
        <Text style={{
          fontSize: 14,
          fontFamily: 'Inter_600SemiBold',
          color: !isHistoryTab ? '#1C1C1E' : '#8E8E93',
        }}>
          Upcoming
        </Text>
        <Switch
          value={isHistoryTab}
          onValueChange={(val) => {
            const next: TabType = val ? 'History' : 'Upcoming';
            console.log('[DoctorCoverage] Tab switch toggled to:', next);
            setActiveTab(next);
          }}
          trackColor={{ false: '#3A3A3C', true: '#2DC653' }}
          thumbColor="#FFFFFF"
        />
        <Text style={{
          fontSize: 14,
          fontFamily: 'Inter_600SemiBold',
          color: isHistoryTab ? '#1C1C1E' : '#8E8E93',
        }}>
          History
        </Text>
      </View>

      {/* Background refresh indicator */}
      {currentRefreshing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8, gap: 6 }}>
          <ActivityIndicator size="small" color="#0066CC" />
          <Text style={{ fontSize: 12, color: '#8E8E93' }}>Updating...</Text>
        </View>
      )}

      {/* Content */}
      {currentLoading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : currentSessions.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        currentSessions.map(session => (
          isHistoryTab ? (
            <DoctorCard
              key={session.id}
              session={session}
              onCall={handleCall}
              onCancel={handleCancel}
              isHistory={true}
            />
          ) : (
            <UpcomingCoverageCard
              key={session.id}
              session={session}
              onCall={handleCall}
              onCancel={handleCancel}
            />
          )
        ))
      )}
    </ScrollView>
  );
}

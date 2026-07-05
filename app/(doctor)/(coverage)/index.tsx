import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '@/constants/Theme';
import { supabase, getValidToken } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { CoverageSession } from '@/contexts/DoctorDispatchContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SUPABASE_URL = 'https://juilousufwlsiqdcgllu.supabase.co';

const TABS = ['Upcoming', 'History'] as const;
type TabType = typeof TABS[number];

const STATUS_PILL: Record<string, { bg: string; text: string }> = {
  upcoming: { bg: '#E4E4E7', text: '#3F3F46' },
  active: { bg: '#DCFCE7', text: '#15803D' },
  paused: { bg: '#FEF3C7', text: '#92400E' },
  completed: { bg: '#F4F4F5', text: '#71717A' },
  cancelled: { bg: '#F4F4F5', text: '#71717A' },
};

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
          {/* Avatar */}
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

          {/* Text info */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }} numberOfLines={1}>
              {session.doctor_name}
            </Text>
            {/* MDCN · ★ rating · ● reliability */}
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
            {/* Shift summary */}
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
  const [upcomingSessions, setUpcomingSessions] = useState<CoverageSession[]>([]);
  const [historySessions, setHistorySessions] = useState<CoverageSession[]>([]);
  const [loading, setLoading] = useState(true);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  const getAccessToken = useCallback(async () => {
    return getValidToken();
  }, []);

  const fetchSessions = useCallback(async () => {
    console.log('[DoctorCoverage] Fetching sessions');
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        console.log('[DoctorCoverage] No access token available');
        return;
      }

      const [upcomingRes, historyRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=doctor&status=upcoming,paused,payment_pending,settled,payment_complete`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
        fetch(`${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=doctor&status=completed,cancelled`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
      ]);

      if (upcomingRes.ok) {
        const data = await upcomingRes.json();
        console.log('[DoctorCoverage] Upcoming sessions fetched:', data?.sessions?.length ?? 0);
        setUpcomingSessions(data?.sessions ?? []);
      } else {
        const errText = await upcomingRes.text();
        console.log('[DoctorCoverage] Upcoming fetch error:', upcomingRes.status, errText);
      }

      if (historyRes.ok) {
        const data = await historyRes.json();
        console.log('[DoctorCoverage] History sessions fetched:', data?.sessions?.length ?? 0);
        setHistorySessions(data?.sessions ?? []);
      } else {
        const errText = await historyRes.text();
        console.log('[DoctorCoverage] History fetch error:', historyRes.status, errText);
      }
    } catch (err) {
      console.log('[DoctorCoverage] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

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
          return removeFromList(prev);
        }
        return prev;
      });
    }
  }, []);

  const setupRealtimeSubscriptions = useCallback((sessions: CoverageSession[], userId: string) => {
    // Clean up existing channels
    channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    channelsRef.current = [];

    // Subscribe to each upcoming session
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

    // Subscribe to doctor channel for new sessions and shift events
    const doctorCh = supabase
      .channel(`doctor:${userId}`)
      .on('broadcast', { event: 'SESSION_CREATED' }, (payload) => {
        console.log('[DoctorCoverage] Realtime SESSION_CREATED:', payload);
        const newSession = payload?.payload?.session as CoverageSession;
        if (newSession) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setUpcomingSessions(prev => [newSession, ...prev]);
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
  }, [handleStatusChange]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

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

      {/* Content */}
      {loading ? (
        <ActivityIndicator size="large" color="#0066CC" style={{ marginTop: SPACING.xxxl }} />
      ) : currentSessions.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        currentSessions.map(session => (
          <DoctorCard
            key={session.id}
            session={session}
            onCall={handleCall}
            onCancel={handleCancel}
            isHistory={isHistoryTab}
          />
        ))
      )}
    </ScrollView>
  );
}

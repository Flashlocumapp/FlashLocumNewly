import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '@/constants/Theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import LiveTimer from '@/components/LiveTimer';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SUPABASE_URL = 'https://juilousufwlsiqdcgllu.supabase.co';

type CoverageSession = {
  id: string;
  request_id: string;
  doctor_id: string;
  requester_id: string;
  hospital_name: string;
  hospital_address: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  shift_type: string;
  coverage_type: string;
  status: 'upcoming' | 'active' | 'paused' | 'completed' | 'cancelled';
  started_at: string | null;
  ended_at: string | null;
  paused_at: string | null;
  doctor_name: string;
  doctor_mdcn: string;
  doctor_rating: number;
  doctor_reliability: number;
  doctor_phone: string | null;
  requester_name: string;
  requester_phone: string | null;
  created_at: string;
};

const TABS = ['Active', 'Upcoming', 'History'] as const;
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

function formatDateChip(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function StatusPill({ status }: { status: string }) {
  const pill = STATUS_PILL[status] ?? STATUS_PILL.upcoming;
  const label = status.toUpperCase();
  return (
    <View
      style={{
        backgroundColor: pill.bg,
        borderRadius: RADIUS.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={[TYPOGRAPHY.label, { color: pill.text }]}>{label}</Text>
    </View>
  );
}

function DateChip({ dateStr }: { dateStr: string }) {
  const label = formatDateChip(dateStr);
  return (
    <View
      style={{
        backgroundColor: '#E4E4E7',
        borderRadius: RADIUS.full,
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <Text style={[TYPOGRAPHY.captionMedium, { color: '#3F3F46' }]}>{label}</Text>
    </View>
  );
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
  onResume: (session: CoverageSession) => void;
  onEndShift: (session: CoverageSession) => void;
  isHistory?: boolean;
}

function DoctorCard({ session, onCall, onCancel, onResume, onEndShift, isHistory }: DoctorCardProps) {
  const isActive = session.status === 'active';
  const isPaused = session.status === 'paused';
  const accentColor = isActive ? '#2DC653' : isPaused ? '#F4A261' : 'transparent';
  const showAccent = isActive || isPaused;

  const shiftStart = formatTime(session.shift_start);
  const shiftEnd = formatTime(session.shift_end);

  const dayLabel = session.shift_date
    ? new Date(session.shift_date).toLocaleDateString('en-US', { weekday: 'short' })
    : '';
  const shiftSummary = `${session.shift_type} · ${dayLabel} · ${shiftStart} – ${shiftEnd}`;

  const initials = getDoctorInitials(session.doctor_name || 'Doctor');
  const ratingDisplay = Number(session.doctor_rating).toFixed(1);
  const reliabilityDisplay = Math.round(Number(session.doctor_reliability));

  const dotColor = isActive ? '#2DC653' : isPaused ? '#F4A261' : '#8E8E93';

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
          ? { boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }
          : { elevation: 3 },
      ]}
    >
      {/* Left accent */}
      {showAccent && (
        <View style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          backgroundColor: accentColor, borderTopLeftRadius: 20, borderBottomLeftRadius: 20,
        }} />
      )}

      <View style={{ padding: 16, paddingLeft: showAccent ? 19 : 16 }}>
        {/* Avatar row */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Avatar with status dot */}
          <View style={{ marginRight: 12 }}>
            <View style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: '#1C1C1E',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>
                {initials}
              </Text>
            </View>
            {/* Status dot */}
            <View style={{
              position: 'absolute', bottom: 1, right: 1,
              width: 13, height: 13, borderRadius: 7,
              backgroundColor: dotColor,
              borderWidth: 2, borderColor: '#FFFFFF',
            }} />
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

        {/* Live timer for active */}
        {isActive && <LiveTimer startedAt={session.started_at} />}

        {/* History ended_at */}
        {isHistory && session.ended_at && (
          <Text style={{ fontSize: 12, color: '#A1A1AA', marginTop: 8 }}>
            {'Ended: '}{new Date(session.ended_at).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        )}

        {/* Action buttons — single row */}
        {!isHistory && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {isActive && (
              <View style={{
                flex: 1, backgroundColor: '#2DC653', borderRadius: 999,
                paddingVertical: 11, alignItems: 'center',
              }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FFFFFF', letterSpacing: 0.3 }}>ON CALL</Text>
              </View>
            )}
            {isPaused && (
              <>
                <TouchableOpacity onPress={() => {
                  console.log('[DoctorCoverage] Resume shift pressed:', session.id);
                  onResume(session);
                }} activeOpacity={0.8}
                  style={{ flex: 1, backgroundColor: '#DCFCE7', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#15803D', letterSpacing: 0.3 }}>RESUME</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  console.log('[DoctorCoverage] End shift pressed:', session.id);
                  onEndShift(session);
                }} activeOpacity={0.8}
                  style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#DC2626', letterSpacing: 0.3 }}>END SHIFT</Text>
                </TouchableOpacity>
              </>
            )}
            {session.status === 'upcoming' && (
              <>
                <TouchableOpacity onPress={() => {
                  console.log('[DoctorCoverage] Call requester pressed:', session.id);
                  onCall(session);
                }} activeOpacity={0.8}
                  style={{ flex: 1, borderWidth: 1.5, borderColor: '#1C1C1E', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#1C1C1E', letterSpacing: 0.3 }}>CALL</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  console.log('[DoctorCoverage] Cancel shift pressed:', session.id);
                  onCancel(session);
                }} activeOpacity={0.8}
                  style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#DC2626', letterSpacing: 0.3 }}>CANCEL</Text>
                </TouchableOpacity>
              </>
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
  const [activeTab, setActiveTab] = useState<TabType>('Active');
  const [activeSessions, setActiveSessions] = useState<CoverageSession[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<CoverageSession[]>([]);
  const [historySessions, setHistorySessions] = useState<CoverageSession[]>([]);
  const [loading, setLoading] = useState(true);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  const getAccessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
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

      const [activeRes, upcomingRes, historyRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=doctor&status=active,paused`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
        fetch(`${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=doctor&status=upcoming`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
        fetch(`${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=doctor&status=completed,cancelled`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
      ]);

      if (activeRes.ok) {
        const data = await activeRes.json();
        console.log('[DoctorCoverage] Active sessions fetched:', data?.sessions?.length ?? 0);
        setActiveSessions(data?.sessions ?? []);
      } else {
        const errText = await activeRes.text();
        console.log('[DoctorCoverage] Active fetch error:', activeRes.status, errText);
      }

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

    const updateInList = (list: CoverageSession[]) =>
      list.map(s => s.id === sessionId ? { ...s, status: newStatus } : s);

    const removeFromList = (list: CoverageSession[]) =>
      list.filter(s => s.id !== sessionId);

    if (newStatus === 'active' || newStatus === 'paused') {
      // Move from upcoming to active if needed
      setUpcomingSessions(prev => {
        const found = prev.find(s => s.id === sessionId);
        if (found) {
          setActiveSessions(active => [...active, { ...found, status: newStatus }]);
          return removeFromList(prev);
        }
        return prev;
      });
      setActiveSessions(prev => updateInList(prev));
    } else if (newStatus === 'completed' || newStatus === 'cancelled') {
      setActiveSessions(prev => {
        const found = prev.find(s => s.id === sessionId);
        if (found) {
          setHistorySessions(hist => [{ ...found, status: newStatus }, ...hist]);
          return removeFromList(prev);
        }
        return prev;
      });
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

    // Subscribe to each session
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

    // Subscribe to doctor channel for new sessions
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
      .subscribe();
    channelsRef.current.push(doctorCh);
  }, [handleStatusChange]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (!user?.id) return;
    const allSessions = [...activeSessions, ...upcomingSessions];
    setupRealtimeSubscriptions(allSessions, user.id);
  }, [activeSessions, upcomingSessions, user?.id, setupRealtimeSubscriptions]);

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

  const handleResume = useCallback(async (session: CoverageSession) => {
    console.log('[DoctorCoverage] Resume action:', session.id);
    const ok = await updateSessionStatus(session.id, 'active');
    if (ok) handleStatusChange(session.id, 'active');
  }, [updateSessionStatus, handleStatusChange]);

  const handleEndShift = useCallback((session: CoverageSession) => {
    console.log('[DoctorCoverage] End shift action initiated:', session.id);
    Alert.alert('End Shift?', 'Are you sure you want to end this shift?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Shift',
        style: 'destructive',
        onPress: async () => {
          console.log('[DoctorCoverage] End shift confirmed:', session.id);
          const ok = await updateSessionStatus(session.id, 'completed');
          if (ok) handleStatusChange(session.id, 'completed');
        },
      },
    ]);
  }, [updateSessionStatus, handleStatusChange]);

  const handleTabPress = (tab: TabType) => {
    console.log('[DoctorCoverage] Tab pressed:', tab);
    setActiveTab(tab);
  };

  const currentSessions =
    activeTab === 'Active' ? activeSessions :
    activeTab === 'Upcoming' ? upcomingSessions :
    historySessions;

  const emptyMessage =
    activeTab === 'Active' ? 'No active shifts right now.' :
    activeTab === 'Upcoming' ? 'No upcoming shifts. Stay online to receive requests.' :
    'No past coverage yet.';

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

      {/* Tab selector */}
      <View
        style={{
          backgroundColor: '#1C1C1E',
          borderRadius: RADIUS.full,
          flexDirection: 'row',
          padding: 4,
          marginBottom: SPACING.xxl,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => handleTabPress(tab)}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: 'center',
                borderRadius: RADIUS.full,
                backgroundColor: isActive ? '#2C2C2E' : 'transparent',
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  TYPOGRAPHY.captionMedium,
                  {
                    color: isActive ? '#FFFFFF' : '#8E8E93',
                    fontWeight: isActive ? '600' : '500',
                  },
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
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
            onResume={handleResume}
            onEndShift={handleEndShift}
            isHistory={activeTab === 'History'}
          />
        ))
      )}
    </ScrollView>
  );
}

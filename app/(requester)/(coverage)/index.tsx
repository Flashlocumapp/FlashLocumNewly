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
import { TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';
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

function getInitials(name: string): string {
  const parts = name.replace(/^Dr\.?\s*/i, '').trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0]?.[0]?.toUpperCase() ?? '?';
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

function DoctorAvatar({ name }: { name: string }) {
  const initials = getInitials(name);
  return (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.md,
      }}
    >
      <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>
        {initials}
      </Text>
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

interface RequesterCardProps {
  session: CoverageSession;
  onCall: (session: CoverageSession) => void;
  onStartShift: (session: CoverageSession) => void;
  onPauseShift: (session: CoverageSession) => void;
  onResumeShift: (session: CoverageSession) => void;
  onEndShift: (session: CoverageSession) => void;
  onCancel: (session: CoverageSession) => void;
  isHistory?: boolean;
}

function RequesterCard({ session, onCall, onStartShift, onPauseShift, onResumeShift, onEndShift, onCancel, isHistory }: RequesterCardProps) {
  const isActive = session.status === 'active';
  const isPaused = session.status === 'paused';
  const isUpcoming = session.status === 'upcoming';
  const isMultiday = session.shift_type?.toLowerCase() === 'multiday';
  const accentColor = isActive ? '#2DC653' : isPaused ? '#F4A261' : 'transparent';
  const showAccent = isActive || isPaused;

  const shiftStart = formatTime(session.shift_start);
  const shiftEnd = formatTime(session.shift_end);
  const dayLabel = session.shift_date
    ? new Date(session.shift_date).toLocaleDateString('en-US', { weekday: 'short' })
    : '';
  const shiftSummary = `${session.shift_type} · ${dayLabel} · ${shiftStart} – ${shiftEnd}`;

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
        {/* Doctor info — no avatar, clean text */}
        <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }} numberOfLines={1}>
          {session.doctor_name}
        </Text>

        {/* MDCN · ★ rating · ● reliability — one line */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 }}>
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

        {/* Live timer for active */}
        {isActive && <LiveTimer startedAt={session.started_at} />}

        {/* History ended_at */}
        {isHistory && session.ended_at && (
          <Text style={{ fontSize: 12, color: '#A1A1AA', marginTop: 8 }}>
            {'Ended: '}{new Date(session.ended_at).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        )}

        {/* Action buttons — single non-wrapping row */}
        {!isHistory && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {/* CALL — always shown */}
            <TouchableOpacity onPress={() => {
              console.log('[RequesterCoverage] Call doctor pressed:', session.id);
              onCall(session);
            }} activeOpacity={0.8}
              style={{ flex: 1, borderWidth: 1.5, borderColor: '#1C1C1E', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#1C1C1E', letterSpacing: 0.3 }}>CALL</Text>
            </TouchableOpacity>

            {/* Upcoming */}
            {isUpcoming && (
              <>
                <TouchableOpacity onPress={() => {
                  console.log('[RequesterCoverage] Start shift pressed:', session.id);
                  onStartShift(session);
                }} activeOpacity={0.8}
                  style={{ flex: 2, backgroundColor: '#1C1C1E', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FFFFFF', letterSpacing: 0.3 }}>START SHIFT</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  console.log('[RequesterCoverage] Cancel shift pressed:', session.id);
                  onCancel(session);
                }} activeOpacity={0.8}
                  style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#DC2626', letterSpacing: 0.3 }}>CANCEL</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Active */}
            {isActive && (
              <>
                {isMultiday && (
                  <TouchableOpacity onPress={() => {
                    console.log('[RequesterCoverage] Pause shift pressed:', session.id);
                    onPauseShift(session);
                  }} activeOpacity={0.8}
                    style={{ flex: 1, backgroundColor: '#FEF3C7', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#92400E', letterSpacing: 0.3 }}>PAUSE</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => {
                  console.log('[RequesterCoverage] End shift pressed:', session.id);
                  onEndShift(session);
                }} activeOpacity={0.8}
                  style={{ flex: 2, backgroundColor: '#FEE2E2', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#DC2626', letterSpacing: 0.3 }}>END SHIFT</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Paused */}
            {isPaused && (
              <>
                <TouchableOpacity onPress={() => {
                  console.log('[RequesterCoverage] Resume shift pressed:', session.id);
                  onResumeShift(session);
                }} activeOpacity={0.8}
                  style={{ flex: 1, backgroundColor: '#DCFCE7', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#15803D', letterSpacing: 0.3 }}>RESUME</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  console.log('[RequesterCoverage] End shift (from paused) pressed:', session.id);
                  onEndShift(session);
                }} activeOpacity={0.8}
                  style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#DC2626', letterSpacing: 0.3 }}>END SHIFT</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export default function RequesterCoverageScreen() {
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
    console.log('[RequesterCoverage] Fetching sessions');
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        console.log('[RequesterCoverage] No access token available');
        return;
      }

      const [activeRes, upcomingRes, historyRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=requester&status=active,paused`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
        fetch(`${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=requester&status=upcoming`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
        fetch(`${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=requester&status=completed,cancelled`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
      ]);

      if (activeRes.ok) {
        const data = await activeRes.json();
        console.log('[RequesterCoverage] Active sessions fetched:', data?.sessions?.length ?? 0);
        setActiveSessions(data?.sessions ?? []);
      } else {
        const errText = await activeRes.text();
        console.log('[RequesterCoverage] Active fetch error:', activeRes.status, errText);
      }

      if (upcomingRes.ok) {
        const data = await upcomingRes.json();
        console.log('[RequesterCoverage] Upcoming sessions fetched:', data?.sessions?.length ?? 0);
        setUpcomingSessions(data?.sessions ?? []);
      } else {
        const errText = await upcomingRes.text();
        console.log('[RequesterCoverage] Upcoming fetch error:', upcomingRes.status, errText);
      }

      if (historyRes.ok) {
        const data = await historyRes.json();
        console.log('[RequesterCoverage] History sessions fetched:', data?.sessions?.length ?? 0);
        setHistorySessions(data?.sessions ?? []);
      } else {
        const errText = await historyRes.text();
        console.log('[RequesterCoverage] History fetch error:', historyRes.status, errText);
      }
    } catch (err) {
      console.log('[RequesterCoverage] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  const updateSessionStatus = useCallback(async (sessionId: string, status: string) => {
    console.log('[RequesterCoverage] Updating session status:', sessionId, '->', status);
    const token = await getAccessToken();
    if (!token) return false;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/update-shift-status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, status }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.log('[RequesterCoverage] Status update error:', res.status, errText);
      return false;
    }
    console.log('[RequesterCoverage] Status update success:', sessionId, status);
    return true;
  }, [getAccessToken]);

  const handleStatusChange = useCallback((sessionId: string, newStatus: CoverageSession['status']) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const updateInList = (list: CoverageSession[]) =>
      list.map(s => s.id === sessionId ? { ...s, status: newStatus } : s);

    const removeFromList = (list: CoverageSession[]) =>
      list.filter(s => s.id !== sessionId);

    if (newStatus === 'active') {
      setUpcomingSessions(prev => {
        const found = prev.find(s => s.id === sessionId);
        if (found) {
          setActiveSessions(active => [...active, { ...found, status: newStatus }]);
          return removeFromList(prev);
        }
        return prev;
      });
      setActiveSessions(prev => updateInList(prev));
    } else if (newStatus === 'paused') {
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
    channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    channelsRef.current = [];

    sessions.forEach(session => {
      const ch = supabase
        .channel(`coverage:${session.id}`)
        .on('broadcast', { event: 'STATUS_CHANGED' }, (payload) => {
          console.log('[RequesterCoverage] Realtime STATUS_CHANGED:', session.id, payload);
          const newStatus = payload?.payload?.status as CoverageSession['status'];
          if (newStatus) handleStatusChange(session.id, newStatus);
        })
        .subscribe();
      channelsRef.current.push(ch);
    });

    const requesterCh = supabase
      .channel(`requester:${userId}`)
      .on('broadcast', { event: 'SESSION_CREATED' }, (payload) => {
        console.log('[RequesterCoverage] Realtime SESSION_CREATED:', payload);
        const newSession = payload?.payload?.session as CoverageSession;
        if (newSession) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setUpcomingSessions(prev => [newSession, ...prev]);
        }
      })
      .subscribe();
    channelsRef.current.push(requesterCh);
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
      console.log('[RequesterCoverage] Cleaning up realtime channels');
      channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    };
  }, []);

  const handleCall = useCallback((session: CoverageSession) => {
    console.log('[RequesterCoverage] Call action:', session.id, 'phone:', session.doctor_phone);
    if (!session.doctor_phone) {
      Alert.alert('No phone number available');
      return;
    }
    Linking.openURL(`tel:${session.doctor_phone}`);
  }, []);

  const handleStartShift = useCallback(async (session: CoverageSession) => {
    console.log('[RequesterCoverage] Start shift action:', session.id);
    const ok = await updateSessionStatus(session.id, 'active');
    if (ok) handleStatusChange(session.id, 'active');
  }, [updateSessionStatus, handleStatusChange]);

  const handlePauseShift = useCallback(async (session: CoverageSession) => {
    console.log('[RequesterCoverage] Pause shift action:', session.id);
    const ok = await updateSessionStatus(session.id, 'paused');
    if (ok) handleStatusChange(session.id, 'paused');
  }, [updateSessionStatus, handleStatusChange]);

  const handleResumeShift = useCallback(async (session: CoverageSession) => {
    console.log('[RequesterCoverage] Resume shift action:', session.id);
    const ok = await updateSessionStatus(session.id, 'active');
    if (ok) handleStatusChange(session.id, 'active');
  }, [updateSessionStatus, handleStatusChange]);

  const handleEndShift = useCallback((session: CoverageSession) => {
    console.log('[RequesterCoverage] End shift action initiated:', session.id);
    Alert.alert('End Shift?', 'Are you sure you want to end this shift?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Shift',
        style: 'destructive',
        onPress: async () => {
          console.log('[RequesterCoverage] End shift confirmed:', session.id);
          const ok = await updateSessionStatus(session.id, 'completed');
          if (ok) {
            handleStatusChange(session.id, 'completed');
            Alert.alert('Shift Ended', 'The shift has been completed successfully.');
          }
        },
      },
    ]);
  }, [updateSessionStatus, handleStatusChange]);

  const handleCancel = useCallback((session: CoverageSession) => {
    console.log('[RequesterCoverage] Cancel action initiated:', session.id);
    Alert.alert('Cancel Shift?', 'This will cancel the booking.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Shift',
        style: 'destructive',
        onPress: async () => {
          console.log('[RequesterCoverage] Cancel confirmed:', session.id);
          const ok = await updateSessionStatus(session.id, 'cancelled');
          if (ok) handleStatusChange(session.id, 'cancelled');
        },
      },
    ]);
  }, [updateSessionStatus, handleStatusChange]);

  const handleTabPress = (tab: TabType) => {
    console.log('[RequesterCoverage] Tab pressed:', tab);
    setActiveTab(tab);
  };

  const currentSessions =
    activeTab === 'Active' ? activeSessions :
    activeTab === 'Upcoming' ? upcomingSessions :
    historySessions;

  const emptyMessage =
    activeTab === 'Active' ? 'No active coverage right now.' :
    activeTab === 'Upcoming' ? 'No upcoming coverage. Request a doctor from the home screen.' :
    'No past coverage yet.';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F7F7F5' }}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: SPACING.base,
        paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[TYPOGRAPHY.h1, { color: COLORS.text, marginBottom: 4 }]}>
        Coverage
      </Text>
      <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginBottom: SPACING.xl }]}>
        Your coverage continuity
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
          <RequesterCard
            key={session.id}
            session={session}
            onCall={handleCall}
            onStartShift={handleStartShift}
            onPauseShift={handlePauseShift}
            onResumeShift={handleResumeShift}
            onEndShift={handleEndShift}
            onCancel={handleCancel}
            isHistory={activeTab === 'History'}
          />
        ))
      )}
    </ScrollView>
  );
}

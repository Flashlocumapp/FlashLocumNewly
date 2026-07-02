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
  const timeRange = `${shiftStart}–${shiftEnd}`;
  const ratingDisplay = Number(session.requester_name ? session.doctor_rating : 0).toFixed(1);
  const reliabilityDisplay = Math.round(Number(session.doctor_reliability));

  return (
    <View
      style={[
        {
          backgroundColor: '#FFFFFF',
          borderRadius: RADIUS.xl,
          marginBottom: SPACING.base,
          overflow: 'hidden',
          opacity: isHistory ? 0.7 : 1,
        },
        Platform.OS === 'ios'
          ? { boxShadow: '0 2px 8px rgba(0,102,204,0.08)' }
          : { elevation: 4 },
      ]}
    >
      {/* Left accent border */}
      {showAccent && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: accentColor,
            borderTopLeftRadius: RADIUS.xl,
            borderBottomLeftRadius: RADIUS.xl,
          }}
        />
      )}

      <View style={{ padding: SPACING.base, paddingLeft: showAccent ? SPACING.base + 3 : SPACING.base }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
          <StatusPill status={session.status} />
          <DateChip dateStr={session.shift_date} />
        </View>

        {/* Hospital info */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.md }}>
          <Text style={{ fontSize: 20, marginRight: SPACING.sm, marginTop: 1 }}>🏥</Text>
          <View style={{ flex: 1 }}>
            <Text style={[TYPOGRAPHY.h4, { color: COLORS.text }]} numberOfLines={1}>
              {session.hospital_name}
            </Text>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginTop: 2 }]} numberOfLines={1}>
              {session.hospital_address}
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: COLORS.divider, marginBottom: SPACING.md }} />

        {/* Stats row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: isHistory ? 0 : SPACING.md, gap: SPACING.base }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 14 }}>🕐</Text>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>{timeRange}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 14, color: '#F4A261' }}>⭐</Text>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>{ratingDisplay}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 14 }}>🔄</Text>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>{reliabilityDisplay}%</Text>
          </View>
        </View>

        {/* History: show ended_at */}
        {isHistory && session.ended_at && (
          <Text style={[TYPOGRAPHY.caption, { color: COLORS.textTertiary, marginTop: SPACING.xs }]}>
            {'Ended: '}
            {new Date(session.ended_at).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        )}

        {/* Action buttons */}
        {!isHistory && (
          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            {isActive && (
              <View
                style={{
                  flex: 1,
                  backgroundColor: '#2DC653',
                  borderRadius: RADIUS.full,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={[TYPOGRAPHY.captionMedium, { color: '#FFFFFF', fontWeight: '700' }]}>
                  ON CALL
                </Text>
              </View>
            )}

            {isPaused && (
              <>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[DoctorCoverage] Resume shift pressed:', session.id);
                    onResume(session);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.successMuted,
                    borderRadius: RADIUS.full,
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[TYPOGRAPHY.captionMedium, { color: COLORS.success, fontWeight: '700' }]}>
                    RESUME
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[DoctorCoverage] End shift pressed:', session.id);
                    onEndShift(session);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.dangerMuted,
                    borderRadius: RADIUS.full,
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[TYPOGRAPHY.captionMedium, { color: COLORS.danger, fontWeight: '700' }]}>
                    END SHIFT
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {session.status === 'upcoming' && (
              <>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[DoctorCoverage] Call requester pressed:', session.id);
                    onCall(session);
                  }}
                  style={{
                    flex: 1,
                    borderWidth: 1.5,
                    borderColor: '#1C1C1E',
                    borderRadius: RADIUS.full,
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[TYPOGRAPHY.captionMedium, { color: '#1C1C1E', fontWeight: '700' }]}>
                    CALL
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[DoctorCoverage] Cancel shift pressed:', session.id);
                    onCancel(session);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.dangerMuted,
                    borderRadius: RADIUS.full,
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[TYPOGRAPHY.captionMedium, { color: COLORS.danger, fontWeight: '700' }]}>
                    CANCEL
                  </Text>
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
          backgroundColor: '#EFEFEF',
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
                backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                ...(isActive
                  ? Platform.OS === 'ios'
                    ? { boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }
                    : { elevation: 2 }
                  : {}),
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  TYPOGRAPHY.captionMedium,
                  {
                    color: isActive ? COLORS.text : COLORS.textSecondary,
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

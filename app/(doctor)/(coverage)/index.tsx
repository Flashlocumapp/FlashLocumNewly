import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  Animated,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, DOCTOR_CANCEL_REASONS } from '@/constants/Theme';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { CoverageSession } from '@/contexts/DoctorDispatchContext';
import { useDoctorDispatch } from '@/contexts/DoctorDispatchContext';
import { useTabData } from '@/hooks/useTabData';
import { invalidate } from '@/utils/tabCache';
import PollingManager from '@/utils/pollingManager';
import { DoctorUpcomingCoverageCard, buildShiftPillText } from '@/components/DoctorUpcomingCoverageCard';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SUPABASE_URL = 'https://juilousufwlsiqdcgllu.supabase.co';

const TABS = ['Upcoming', 'History'] as const;
type TabType = typeof TABS[number];

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

function HistoryCoverageCard({ session, onPress }: {
  session: CoverageSession;
  onPress: (session: CoverageSession) => void;
}) {
  const ratingDisplay = session.final_requester_rating != null
    ? Number(session.final_requester_rating).toFixed(1)
    : (session.requester_rating != null ? Number(session.requester_rating).toFixed(1) : '5.0');

  const reliabilityDisplay = session.final_requester_reliability != null
    ? `${Math.round(Number(session.final_requester_reliability))}`
    : (session.requester_reliability != null ? `${Math.round(Number(session.requester_reliability))}` : '100');
  const shiftPillText = buildShiftPillText(session);

  const statusLabel = session.status === 'cancelled'
    ? (session.cancelled_by === 'doctor' ? 'YOU CANCELLED' : 'CANCELLED')
    : session.status === 'requester_paid' ? 'PAID' : 'COMPLETED SHIFT';
  const statusColor = session.status === 'cancelled' ? '#EF4444' :
    session.status === 'requester_paid' ? '#34C759' : '#8E8E93';

  return (
    <TouchableOpacity
      onPress={() => {
        console.log('[DoctorCoverage] History card pressed for session:', session.id);
        onPress(session);
      }}
      activeOpacity={0.85}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
        ...(Platform.OS === 'ios' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' } as any : { elevation: 4 }),
      }}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 11, letterSpacing: 1.2, color: statusColor, fontFamily: 'Inter_600SemiBold' }}>
          {statusLabel}
        </Text>
        <Text style={{ fontSize: 11, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>{'Tap for details ›'}</Text>
      </View>

      {/* Hospital name + rating inline row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'nowrap' }}>
        <Text style={{ fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E', flexShrink: 1 }} numberOfLines={1}>
          {session.hospital_name}
        </Text>
        <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginHorizontal: 8 }}>{'|'}</Text>
        <Text style={{ fontSize: 13, color: '#F4A261' }}>{'★ '}</Text>
        <Text style={{ fontSize: 13, color: '#1C1C1E', fontFamily: 'Inter_600SemiBold' }}>{ratingDisplay}</Text>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#34C759', marginHorizontal: 5 }} />
        <Text style={{ fontSize: 13, color: '#1C1C1E', fontFamily: 'Inter_600SemiBold' }}>{reliabilityDisplay}</Text>
        <Text style={{ fontSize: 13, color: '#1C1C1E', fontFamily: 'Inter_600SemiBold' }}>{'%'}</Text>
      </View>

      {/* Shift pill */}
      <View style={{ backgroundColor: '#F0F0F0', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' }}>
        <Text style={{ fontSize: 12, color: '#1C1C1E', fontFamily: 'Inter_400Regular' }} numberOfLines={1}>
          {shiftPillText}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function HistoryDetailSheet({ session, visible, onClose, alreadyReviewed, onReviewSubmitted }: {
  session: CoverageSession | null;
  visible: boolean;
  onClose: () => void;
  alreadyReviewed: boolean;
  onReviewSubmitted: (sessionId: string) => void;
}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 50) {
          onClose();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) { setStars(0); setComment(''); setError(''); }
  }, [visible, session?.id]);

  if (!session) return null;

  const ratingDisplay = session.final_requester_rating != null
    ? Number(session.final_requester_rating).toFixed(1)
    : (session.requester_rating != null ? Number(session.requester_rating).toFixed(1) : '5.0');

  const reliabilityDisplay = session.final_requester_reliability != null
    ? `${Math.round(Number(session.final_requester_reliability))}`
    : (session.requester_reliability != null ? `${Math.round(Number(session.requester_reliability))}` : '100');

  const shiftStart = new Date(session.shift_start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const shiftEnd = new Date(session.shift_end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dayLabel = session.shift_date ? new Date(session.shift_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : '';
  const shiftHours = session.per_day_hours && Number(session.per_day_hours) > 0 ? Number(session.per_day_hours) : 8;
  const totalHours = shiftHours * (session.coverage_length ?? 1);
  const hoursDisplay = totalHours % 1 === 0 ? `${totalHours}hr` : `${totalHours.toFixed(1)}hr`;
  const shiftSummaryLine = `${session.shift_type} · ${dayLabel} · ${shiftStart} - ${shiftEnd} · ${hoursDisplay} · ₦${Number(session.booked_price ?? session.price ?? 0).toLocaleString()}`;

  const settlementStatus = session.status === 'cancelled' ? 'Cancelled' : (session.status === 'requester_paid' || session.status === 'completed' || session.status === 'payment_complete' ? 'Paid' : 'Pending');
  const settlementColor = settlementStatus === 'Cancelled' ? '#EF4444' : settlementStatus === 'Paid' ? '#34C759' : '#FFFFFF';

  const formatDateTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const handleSubmit = async () => {
    if (stars === 0) { setError('Please select a star rating.'); return; }
    console.log('[DoctorCoverage] Submitting review for session:', session.id, 'stars:', stars);
    setSubmitting(true); setError('');
    try {
      const res = await fetchWithAuth(`${SUPABASE_URL}/functions/v1/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, stars, comment: comment.trim() || null, reviewer_role: 'doctor' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit rating');
      console.log('[DoctorCoverage] Review submitted successfully for session:', session.id);
      onReviewSubmitted(session.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const statusSheetLabel = session.status === 'cancelled'
    ? (session.cancelled_by === 'doctor' ? 'YOU CANCELLED THIS SHIFT' : 'CANCELLED SHIFT')
    : 'COMPLETED SHIFT';
  const financialRows = [
    { label: 'Amount', value: `₦${Number((session as any).total_cost ?? session.price ?? 0).toLocaleString()}`, bold: true, valueColor: undefined as string | undefined },
    { label: 'Settlement', value: settlementStatus, bold: true, valueColor: settlementColor },
    { label: 'Started', value: formatDateTime(session.started_at), bold: true, valueColor: undefined as string | undefined },
    { label: 'Ended', value: formatDateTime(session.ended_at), bold: true, valueColor: undefined as string | undefined },
    { label: 'Completed', value: session.status === 'cancelled' ? '—' : formatDate(session.ended_at ?? (session as any).updated_at), bold: true },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: '#2C2C2E', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 40 }}>
              {/* Drag handle */}
              <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <View
                  {...panResponder.panHandlers}
                  style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#636366' }}
                />
              </TouchableOpacity>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingTop: 8 }}>
                {/* Label */}
                <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold', marginBottom: 10 }}>
                  {statusSheetLabel}
                </Text>

                {/* Name + rating inline */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFFFFF', flexShrink: 1 }} numberOfLines={1}>
                    {session.hospital_name}
                  </Text>
                  <Text style={{ fontSize: 14, color: '#8E8E93', marginHorizontal: 8 }}>{'|'}</Text>
                  <Text style={{ fontSize: 14, color: '#F4A261' }}>{'★ '}</Text>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#F4A261' }}>{ratingDisplay}</Text>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#34C759', marginHorizontal: 5 }} />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#34C759' }}>{reliabilityDisplay}</Text>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#34C759' }}>{'%'}</Text>
                </View>

                {/* Address */}
                <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 14 }}>
                  {session.hospital_address}
                </Text>

                {/* Shift summary line */}
                <Text style={{ fontSize: 14, color: '#ADADAD', fontFamily: 'Inter_400Regular', marginBottom: 16 }}>
                  {shiftSummaryLine}
                </Text>

                {/* Financial breakdown box */}
                <View style={{ backgroundColor: '#3A3A3C', borderRadius: 16, padding: 16, marginBottom: 20 }}>
                  {financialRows.map((row, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: '#48484A' }}>
                      <Text style={{ fontSize: 14, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>{row.label}</Text>
                      <Text style={{ fontSize: 14, color: (row as any).valueColor ?? '#FFFFFF', fontFamily: 'Inter_700Bold' }}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Rating section */}
                {session.status !== 'cancelled' && (
                  alreadyReviewed ? (
                    <Text style={{ fontSize: 14, color: '#8E8E93', fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 8 }}>
                      {'You\'ve already rated this coverage.'}
                    </Text>
                  ) : (
                    <View style={{ backgroundColor: '#3A3A3C', borderRadius: 16, padding: 16 }}>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF', marginBottom: 4 }}>
                        {`How was your experience with ${session.hospital_name}?`}
                      </Text>
                      <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 16 }}>
                        {'Share your feedback and help us improve.'}
                      </Text>
                      {/* Stars */}
                      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <TouchableOpacity key={n} onPress={() => {
                            console.log('[DoctorCoverage] Star rating selected:', n, 'for session:', session.id);
                            setStars(n);
                          }} activeOpacity={0.7}>
                            <Text style={{ fontSize: 32, color: n <= stars ? '#F4A261' : '#D1D1D6' }}>{'★'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {/* Comment */}
                      <TextInput
                        value={comment}
                        onChangeText={setComment}
                        placeholder="Optional feedback"
                        placeholderTextColor="#636366"
                        multiline
                        numberOfLines={3}
                        scrollEnabled={false}
                        blurOnSubmit={false}
                        style={{ backgroundColor: '#1C1C1E', borderRadius: 12, padding: 12, fontSize: 14, color: '#FFFFFF', fontFamily: 'Inter_400Regular', minHeight: 80, textAlignVertical: 'top', marginBottom: 12 }}
                      />
                      {!!error && <Text style={{ fontSize: 13, color: '#EF4444', marginBottom: 8 }}>{error}</Text>}
                      {/* Submit */}
                      <TouchableOpacity
                        onPress={handleSubmit}
                        disabled={submitting}
                        activeOpacity={0.85}
                        style={{ backgroundColor: submitting ? '#8E8E93' : '#FFFFFF', borderRadius: 999, paddingVertical: 14, alignItems: 'center' }}
                      >
                        <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }}>
                          {submitting ? 'Submitting...' : 'Submit rating'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )
                )}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function DoctorCoverageScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('Upcoming');

  // Use shared context state — single source of truth
  const { upcomingSessions, setUpcomingSessions, reconcileUpcomingSessions } = useDoctorDispatch();

  const upcomingKey = `doctor-coverage-upcoming-${user?.id ?? 'anon'}`;
  const historyKey = `doctor-coverage-history-${user?.id ?? 'anon'}`;

  const {
    data: historyData,
    loading: historyLoading,
    refreshing: historyRefreshing,
  } = useTabData<CoverageSession[]>({
    cacheKey: historyKey,
    fetcher: useCallback(async () => {
      if (!user?.id) return [];
      console.log('[DoctorCoverage] fetching history sessions for', user.id);
      const res = await fetchWithAuth(
        `${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=doctor&status=completed,cancelled,requester_paid,settled,payment_complete`,
        { headers: { 'Content-Type': 'application/json' } },
      );
      if (!res.ok) {
        throw new Error('Failed to load history sessions');
      }
      const data = await res.json();
      return data?.sessions ?? [];
    }, [user?.id]), // eslint-disable-line react-hooks/exhaustive-deps
    alwaysRefresh: true,
  });

  const [historySessions, setHistorySessions] = useState<CoverageSession[]>([]);
  const [selectedHistorySession, setSelectedHistorySession] = useState<CoverageSession | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [showCancelReasons, setShowCancelReasons] = useState(false);
  const [pendingCancelSession, setPendingCancelSession] = useState<CoverageSession | null>(null);

  useEffect(() => {
    if (!historyData || !user?.id) return;
    setHistorySessions(historyData);
    const ids = historyData.map((s: CoverageSession) => s.id);
    if (ids.length === 0) return;
    supabase
      .from('shift_reviews')
      .select('session_id')
      .eq('reviewer_id', user.id)
      .in('session_id', ids)
      .then(({ data }) => {
        if (data) setReviewedIds(new Set(data.map((r: { session_id: string }) => r.session_id)));
      });
  }, [historyData, user?.id]);

  const updateSessionStatus = useCallback(async (sessionId: string, status: string, extraFields?: Record<string, string>) => {
    console.log('[DoctorCoverage] updateSessionStatus — sessionId:', sessionId, 'status:', status, 'extra:', extraFields);
    const res = await fetchWithAuth(`${SUPABASE_URL}/functions/v1/update-shift-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, status, ...extraFields }),
    });
    if (!res.ok) {
      return false;
    }
    return true;
  }, []);

  // Ref to always have the latest upcomingSessions without stale closure
  const upcomingSessionsRef = useRef(upcomingSessions);
  useEffect(() => { upcomingSessionsRef.current = upcomingSessions; }, [upcomingSessions]);

  const handleStatusChange = useCallback((sessionId: string, newStatus: CoverageSession['status']) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    if (newStatus === 'completed' || newStatus === 'cancelled') {
      const current = upcomingSessionsRef.current;
      const found = current.find(s => s.id === sessionId);
      if (found) {
        setHistorySessions(hist => [{ ...found, status: newStatus }, ...hist]);
        invalidate(upcomingKey);
        invalidate(historyKey);
        setUpcomingSessions(current.filter(s => s.id !== sessionId));
      }
    }
  }, [upcomingKey, historyKey, setUpcomingSessions]);

  const handleCall = useCallback((session: CoverageSession) => {
    console.log('[DoctorCoverage] Call pressed for session:', session.id, 'requester_phone:', session.requester_phone);
    if (!session.requester_phone) {
      Alert.alert('No phone number available');
      return;
    }
    Linking.openURL(`tel:${session.requester_phone}`);
  }, []);

  const handleCancel = useCallback((session: CoverageSession) => {
    console.log('[DoctorCoverage] Cancel shift pressed for session:', session.id);
    Alert.alert('Cancel Shift?', 'This will cancel the booking.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Shift',
        style: 'destructive',
        onPress: () => {
          console.log('[DoctorCoverage] Cancel confirmed, showing reason picker for session:', session.id);
          setPendingCancelSession(session);
          setShowCancelReasons(true);
        },
      },
    ]);
  }, []);

  const handleCancelReasonSelected = useCallback(async (reason: string) => {
    if (!pendingCancelSession) return;
    console.log('[DoctorCoverage] Cancel reason selected:', reason, 'for session:', pendingCancelSession.id);
    setShowCancelReasons(false);
    const sessionId = pendingCancelSession.id;
    setPendingCancelSession(null);
    try {
      const ok = await updateSessionStatus(sessionId, 'cancelled', {
        cancellation_reason: reason,
        cancelled_by: 'doctor',
      });
      if (ok) {
        console.log('[DoctorCoverage] Session cancelled successfully with reason:', reason);
        handleStatusChange(sessionId, 'cancelled');
        reconcileUpcomingSessions();
        // 5s polling fallback — confirms the DB write landed
        PollingManager.start(`cancel-doctor-${sessionId}`, async () => {
          const { data: s } = await supabase
            .from('coverage_sessions')
            .select('status')
            .eq('id', sessionId)
            .maybeSingle();
          if (s?.status === 'cancelled') {
            reconcileUpcomingSessions();
            return true; // confirmed — stop polling
          }
          return false;
        });
      } else {
        console.error('[DoctorCoverage] Failed to cancel session:', sessionId);
      }
    } catch (e) {
      console.error('[DoctorCoverage] Exception cancelling session:', e);
    }
  }, [pendingCancelSession, updateSessionStatus, handleStatusChange, reconcileUpcomingSessions]);

  const handleReviewSubmitted = useCallback((sessionId: string) => {
    setReviewedIds(prev => new Set([...prev, sessionId]));
  }, []);

  type DateRange = 'this_month' | 'last_month' | 'last_3_months';
  const [dateRange, setDateRange] = useState<DateRange>('this_month');

  function filterByDateRange(sessions: CoverageSession[], range: DateRange): CoverageSession[] {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());

    return sessions.filter(s => {
      const d = new Date(s.shift_date);
      if (range === 'this_month') return d >= startOfMonth;
      if (range === 'last_month') return d >= startOfLastMonth && d <= endOfLastMonth;
      return d >= threeMonthsAgo;
    });
  }

  const tabUnderlineX = useRef(new Animated.Value(0)).current;
  const TAB_WIDTH = 100;

  useEffect(() => {
    Animated.timing(tabUnderlineX, {
      toValue: activeTab === 'Upcoming' ? 0 : TAB_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [activeTab]);

  const isHistoryTab = activeTab === 'History';
  const sortedHistory = [...historySessions].sort((a, b) => {
    const aTime = new Date(a.ended_at ?? a.created_at ?? a.shift_date).getTime();
    const bTime = new Date(b.ended_at ?? b.created_at ?? b.shift_date).getTime();
    return bTime - aTime;
  });
  const filteredHistory = filterByDateRange(sortedHistory, dateRange);
  const sortedUpcoming = [...upcomingSessions].sort((a, b) =>
    new Date(a.shift_start).getTime() - new Date(b.shift_start).getTime()
  );
  const currentSessions = isHistoryTab ? filteredHistory : sortedUpcoming;
  const currentLoading = isHistoryTab ? historyLoading : false;
  const emptyMessage = isHistoryTab
    ? 'No past coverage yet.'
    : 'No upcoming shifts. Stay online to receive requests.';

  return (
    <View style={{ flex: 1 }}>
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

      {/* Underline tab selector */}
      <View style={{ marginBottom: SPACING.xl }}>
        <View style={{ flexDirection: 'row' }}>
          {(['Upcoming', 'History'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => {
                console.log('[DoctorCoverage] Tab pressed:', tab);
                setActiveTab(tab);
              }}
              activeOpacity={0.7}
              style={{ width: TAB_WIDTH, paddingBottom: 10, alignItems: 'center' }}
            >
              <Text style={{
                fontSize: 15,
                fontFamily: activeTab === tab ? 'Inter_700Bold' : 'Inter_400Regular',
                color: activeTab === tab ? '#1C1C1E' : '#8E8E93',
              }}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* Animated underline */}
        <View style={{ height: 2, backgroundColor: '#E5E5EA' }}>
          <Animated.View style={{
            height: 2,
            width: TAB_WIDTH,
            backgroundColor: '#1C1C1E',
            transform: [{ translateX: tabUnderlineX }],
          }} />
        </View>
      </View>

      {/* Date-range filter pills (History only) */}
      {isHistoryTab && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {([
            { key: 'this_month', label: 'This Month' },
            { key: 'last_month', label: 'Last Month' },
            { key: 'last_3_months', label: 'Last 3 Months' },
          ] as { key: DateRange; label: string }[]).map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              onPress={() => {
                console.log('[DoctorCoverage] Date range filter pressed:', key);
                setDateRange(key);
              }}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: dateRange === key ? '#1C1C1E' : '#F0F0F0',
              }}
            >
              <Text style={{
                fontSize: 12,
                fontFamily: 'Inter_600SemiBold',
                color: dateRange === key ? '#FFFFFF' : '#1C1C1E',
              }}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      {currentLoading ? (
        <ActivityIndicator color={COLORS.text} style={{ marginTop: SPACING.xl }} />
      ) : currentSessions.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        currentSessions.map(session => (
          isHistoryTab ? (
            <HistoryCoverageCard
              key={session.id}
              session={session}
              onPress={(s) => {
                setSelectedHistorySession(s);
              }}
            />
          ) : (
            <DoctorUpcomingCoverageCard
              key={session.id}
              session={session}
              onCall={handleCall}
              onCancel={handleCancel}
            />
          )
        ))
      )}
      <HistoryDetailSheet
        session={selectedHistorySession}
        visible={selectedHistorySession !== null}
        onClose={() => setSelectedHistorySession(null)}
        alreadyReviewed={selectedHistorySession ? reviewedIds.has(selectedHistorySession.id) : false}
        onReviewSubmitted={handleReviewSubmitted}
      />
    </ScrollView>

    {/* ── CANCEL SHIFT REASON MODAL ── */}
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
          {DOCTOR_CANCEL_REASONS.map((reason) => (
            <TouchableOpacity
              key={reason}
              onPress={() => handleCancelReasonSelected(reason)}
              style={{ backgroundColor: '#2C2C2E', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Text style={{ fontSize: 15, color: '#FFFFFF', fontWeight: '500' }}>{reason}</Text>
              <Text style={{ fontSize: 18, color: '#8E8E93' }}>{'›'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
    </View>
  );
}

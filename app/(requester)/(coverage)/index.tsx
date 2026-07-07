import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { supabase, getValidToken } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';
import { useTabData } from '@/hooks/useTabData';

const SUPABASE_URL = 'https://juilousufwlsiqdcgllu.supabase.co';
const EDGE_BASE = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1';

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
  status: 'upcoming' | 'active' | 'paused' | 'completed' | 'cancelled' | 'requester_paid';
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
  price?: number;
  total_cost?: number;
};

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

// ─── HistoryCard ──────────────────────────────────────────────────────────────

function HistoryCard({ session, onPress }: {
  session: CoverageSession;
  onPress: (session: CoverageSession) => void;
}) {
  const ratingDisplay = Number(session.doctor_rating ?? 0).toFixed(1);
  const reliabilityDisplay = Math.round(Number(session.doctor_reliability ?? 100));

  const shiftStart = formatTime(session.shift_start);
  const shiftEnd = formatTime(session.shift_end);
  const dayLabel = session.shift_date
    ? new Date(session.shift_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
    : '';
  const shiftPill = `${session.shift_type} ● ${dayLabel} ● ${shiftStart} - ${shiftEnd}`;

  const statusLabel = session.status === 'cancelled' ? 'CANCELLED' :
    session.status === 'requester_paid' ? 'PAID' : 'COMPLETED';
  const statusColor = session.status === 'cancelled' ? '#EF4444' :
    session.status === 'requester_paid' ? '#34C759' : '#8E8E93';

  return (
    <TouchableOpacity
      onPress={() => {
        console.log('[RequesterCoverage] HistoryCard pressed for session:', session.id);
        onPress(session);
      }}
      activeOpacity={0.85}
      style={{
        backgroundColor: '#2C2C2E',
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
        ...(Platform.OS === 'ios' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.18)' } as any : { elevation: 4 }),
      }}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 11, letterSpacing: 1.2, color: statusColor, fontFamily: 'Inter_600SemiBold' }}>
          {statusLabel}
        </Text>
        <Text style={{ fontSize: 11, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>{'Tap for details ›'}</Text>
      </View>

      {/* Doctor name + rating inline */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'nowrap' }}>
        <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: '#FFFFFF', flexShrink: 1 }} numberOfLines={1}>
          {session.doctor_name}
        </Text>
        <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginHorizontal: 8 }}>{'|'}</Text>
        <Text style={{ fontSize: 13, color: '#F4A261' }}>{'★ '}</Text>
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' }}>{ratingDisplay}</Text>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759', marginHorizontal: 5 }} />
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' }}>{reliabilityDisplay}{'%'}</Text>
      </View>

      {/* MDCN */}
      <Text style={{ fontSize: 12, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 8 }}>
        {session.doctor_mdcn || 'MDCN/R/—'}
      </Text>

      {/* Shift pill */}
      <View style={{ backgroundColor: '#3A3A3C', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' }}>
        <Text style={{ fontSize: 12, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }} numberOfLines={1}>
          {shiftPill}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── HistoryDetailSheet ───────────────────────────────────────────────────────

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

  useEffect(() => {
    if (visible) { setStars(0); setComment(''); setError(''); }
  }, [visible, session?.id]);

  if (!session) return null;

  const ratingDisplay = Number(session.doctor_rating ?? 0).toFixed(1);
  const reliabilityDisplay = Math.round(Number(session.doctor_reliability ?? 100));
  const doctorFirstName = (session.doctor_name ?? '').replace(/^Dr\.?\s*/i, '').split(' ')[0];

  const shiftStart = formatTime(session.shift_start);
  const shiftEnd = formatTime(session.shift_end);
  const dayLabel = session.shift_date
    ? new Date(session.shift_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
    : '';
  const shiftSummaryLine = `${session.shift_type} · ${dayLabel} · ${shiftStart} - ${shiftEnd}`;

  const settlementStatus = session.status === 'requester_paid' || session.status === 'completed' ? 'Paid' : 'Pending';

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
    console.log('[RequesterCoverage] Submitting review for session:', session.id, 'stars:', stars);
    setSubmitting(true); setError('');
    try {
      const token = await getValidToken();
      const res = await fetch(`${EDGE_BASE}/submit-review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, stars, comment: comment.trim() || undefined }),
      });
      console.log('[RequesterCoverage] submit-review response:', res.status);
      const data = await res.json();
      if (!res.ok) throw new Error((data as any).error ?? 'Failed to submit review');
      console.log('[RequesterCoverage] Review submitted successfully:', (data as any)?.review?.id);
      onReviewSubmitted(session.id);
    } catch (e: any) {
      console.log('[RequesterCoverage] Review submission error:', e.message);
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const shiftLabel = session.status === 'cancelled' ? 'CANCELLED SHIFT' : 'COMPLETED SHIFT';

  const amountValue = `₦${Number(session.total_cost ?? session.price ?? 0).toLocaleString()}`;

  const detailRows = [
    { label: 'Amount', value: amountValue },
    { label: 'Payment Status', value: settlementStatus },
    { label: 'Started', value: formatDateTime(session.started_at) },
    { label: 'Ended', value: formatDateTime(session.ended_at) },
    { label: 'Completed', value: formatDate(session.ended_at) },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ backgroundColor: '#2C2C2E', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 40 }}>
              {/* Drag handle — tapping it also closes */}
              <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#636366' }} />
              </TouchableOpacity>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, paddingTop: 8 }}>
                {/* Label */}
                <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold', marginBottom: 10 }}>
                  {shiftLabel}
                </Text>

                {/* Doctor name + rating inline */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFFFFF', flexShrink: 1 }} numberOfLines={1}>
                    {session.doctor_name}
                  </Text>
                  <Text style={{ fontSize: 14, color: '#8E8E93', marginHorizontal: 8 }}>{'|'}</Text>
                  <Text style={{ fontSize: 14, color: '#F4A261' }}>{'★ '}</Text>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#F4A261' }}>{ratingDisplay}</Text>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759', marginHorizontal: 5 }} />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#34C759' }}>{reliabilityDisplay}{'%'}</Text>
                </View>

                {/* MDCN */}
                <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 10 }}>
                  {session.doctor_mdcn || 'MDCN/R/—'}
                </Text>

                {/* Hospital name + address */}
                <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#ADADAD', marginBottom: 2 }}>
                  {session.hospital_name}
                </Text>
                <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 12 }}>
                  {session.hospital_address}
                </Text>

                {/* Shift summary line */}
                <Text style={{ fontSize: 14, color: '#ADADAD', fontFamily: 'Inter_400Regular', marginBottom: 16 }}>
                  {shiftSummaryLine}
                </Text>

                {/* Financial breakdown box */}
                <View style={{ backgroundColor: '#3A3A3C', borderRadius: 16, padding: 16, marginBottom: 20 }}>
                  {detailRows.map((row, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: i < detailRows.length - 1 ? 1 : 0, borderBottomColor: '#48484A' }}>
                      <Text style={{ fontSize: 14, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>{row.label}</Text>
                      <Text style={{ fontSize: 14, color: '#FFFFFF', fontFamily: 'Inter_700Bold', flexShrink: 1, textAlign: 'right', marginLeft: 12 }}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Rating section */}
                {session.status !== 'cancelled' && (
                  alreadyReviewed ? (
                    <Text style={{ fontSize: 14, color: '#8E8E93', fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 8 }}>
                      {"You've already rated this coverage."}
                    </Text>
                  ) : (
                    <View style={{ backgroundColor: '#3A3A3C', borderRadius: 16, padding: 16 }}>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF', marginBottom: 4 }}>
                        {`How was your experience with Dr. ${doctorFirstName}?`}
                      </Text>
                      <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 16 }}>
                        {'Share your feedback and help us improve.'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <TouchableOpacity
                            key={n}
                            onPress={() => {
                              console.log('[RequesterCoverage] Star rating pressed:', n);
                              setStars(n);
                              setError('');
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 32, color: n <= stars ? '#F4A261' : '#636366' }}>{'★'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput
                        value={comment}
                        onChangeText={setComment}
                        placeholder="Optional feedback"
                        placeholderTextColor="#636366"
                        multiline
                        style={{ backgroundColor: '#1C1C1E', borderRadius: 12, padding: 12, fontSize: 14, color: '#FFFFFF', fontFamily: 'Inter_400Regular', minHeight: 80, textAlignVertical: 'top', marginBottom: 12 }}
                      />
                      {!!error && <Text style={{ fontSize: 13, color: '#EF4444', marginBottom: 8 }}>{error}</Text>}
                      <TouchableOpacity
                        onPress={() => {
                          console.log('[RequesterCoverage] Submit rating pressed, stars:', stars);
                          handleSubmit();
                        }}
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
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RequesterCoverageScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [selectedSession, setSelectedSession] = useState<CoverageSession | null>(null);

  const cacheKey = `requester-coverage-${user?.id ?? 'anon'}`;

  const { data: historySessions, loading, refreshing } = useTabData<CoverageSession[]>({
    cacheKey,
    fetcher: async () => {
      console.log('[RequesterCoverage] Fetching history sessions');
      const token = await getValidToken();
      if (!token) {
        console.log('[RequesterCoverage] No access token available');
        return [];
      }
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=requester&status=completed,cancelled,requester_paid`,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      if (!res.ok) {
        const errText = await res.text();
        console.log('[RequesterCoverage] Fetch error:', res.status, errText);
        throw new Error('Failed to load coverage history');
      }
      const data = await res.json();
      const sessions: CoverageSession[] = data?.sessions ?? [];
      console.log('[RequesterCoverage] History sessions fetched:', sessions.length);

      // Check which requester_paid sessions have already been reviewed
      const paidIds = sessions
        .filter((s) => s.status === 'requester_paid')
        .map((s) => s.id);

      if (paidIds.length > 0 && user?.id) {
        console.log('[RequesterCoverage] Checking reviews for', paidIds.length, 'paid sessions');
        const { data: reviews, error: reviewErr } = await supabase
          .from('shift_reviews')
          .select('session_id')
          .eq('reviewer_id', user.id)
          .in('session_id', paidIds);

        if (reviewErr) {
          console.log('[RequesterCoverage] Error fetching reviews:', reviewErr.message);
        } else {
          const ids = new Set<string>((reviews ?? []).map((r: { session_id: string }) => r.session_id));
          console.log('[RequesterCoverage] Already reviewed sessions:', ids.size);
          setReviewedIds(ids);
        }
      }

      return sessions;
    },
    alwaysRefresh: true,
  });

  const sessions = historySessions ?? [];

  const alreadyReviewed = selectedSession ? reviewedIds.has(selectedSession.id) : false;

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

      {/* Background refresh indicator */}
      {refreshing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8, gap: 6 }}>
          <ActivityIndicator size="small" color="#0066CC" />
          <Text style={{ fontSize: 12, color: '#8E8E93' }}>Updating...</Text>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : sessions.length === 0 ? (
        <EmptyState message="No past coverage yet." />
      ) : (
        sessions.map(session => (
          <HistoryCard
            key={session.id}
            session={session}
            onPress={(s) => {
              console.log('[RequesterCoverage] Opening detail sheet for session:', s.id);
              setSelectedSession(s);
            }}
          />
        ))
      )}

      <HistoryDetailSheet
        session={selectedSession}
        visible={selectedSession !== null}
        onClose={() => {
          console.log('[RequesterCoverage] HistoryDetailSheet dismissed');
          setSelectedSession(null);
        }}
        alreadyReviewed={alreadyReviewed}
        onReviewSubmitted={(id) => {
          console.log('[RequesterCoverage] Review submitted, marking session:', id);
          setReviewedIds(prev => new Set([...prev, id]));
        }}
      />
    </ScrollView>
  );
}

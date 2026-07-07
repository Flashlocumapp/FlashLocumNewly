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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  PanResponder,
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

function HistoryCoverageCard({ session, onPress }: {
  session: CoverageSession;
  onPress: (session: CoverageSession) => void;
}) {
  const ratingDisplay = Number(session.doctor_rating ?? 0).toFixed(1);
  const reliabilityDisplay = Math.round(Number(session.doctor_reliability ?? 100));
  const shiftPillText = buildShiftPillText(session);

  const statusLabel = session.status === 'cancelled' ? 'CANCELLED' :
    session.status === 'requester_paid' ? 'PAID' : 'COMPLETED SHIFT';
  const statusColor = session.status === 'cancelled' ? '#EF4444' :
    session.status === 'requester_paid' ? '#34C759' : '#8E8E93';

  return (
    <TouchableOpacity
      onPress={() => {
        console.log('[DoctorCoverage] HistoryCoverageCard pressed:', session.id, 'status:', session.status);
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

      {/* Hospital name + rating inline row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'nowrap' }}>
        <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: '#FFFFFF', flexShrink: 1 }} numberOfLines={1}>
          {session.hospital_name}
        </Text>
        <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginHorizontal: 8 }}>{'|'}</Text>
        <Text style={{ fontSize: 13, color: '#F4A261' }}>{'★ '}</Text>
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' }}>{ratingDisplay}</Text>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759', marginHorizontal: 5 }} />
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' }}>{reliabilityDisplay}{'%'}</Text>
      </View>

      {/* Shift pill */}
      <View style={{ backgroundColor: '#3A3A3C', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' }}>
        <Text style={{ fontSize: 12, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }} numberOfLines={1}>
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
          console.log('[DoctorCoverage] Drag-down gesture closed HistoryDetailSheet');
          onClose();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) { setStars(0); setComment(''); setError(''); }
  }, [visible, session?.id]);

  if (!session) return null;

  const ratingDisplay = Number(session.doctor_rating ?? 0).toFixed(1);
  const reliabilityDisplay = Math.round(Number(session.doctor_reliability ?? 100));

  const shiftStart = new Date(session.shift_start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const shiftEnd = new Date(session.shift_end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dayLabel = session.shift_date ? new Date(session.shift_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : '';
  const shiftHours = session.per_day_hours && Number(session.per_day_hours) > 0 ? Number(session.per_day_hours) : 8;
  const totalHours = shiftHours * (session.coverage_length ?? 1);
  const hoursDisplay = totalHours % 1 === 0 ? `${totalHours}hr` : `${totalHours.toFixed(1)}hr`;
  const shiftSummaryLine = `${session.shift_type} · ${dayLabel} · ${shiftStart} - ${shiftEnd} · ${hoursDisplay} · ₦${Number(session.price ?? 0).toLocaleString()}`;

  const settlementStatus = session.status === 'requester_paid' || session.status === 'completed' || session.status === 'disbursed' ? 'Paid' : 'Pending';

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
      const token = await getValidToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, stars, comment: comment.trim() || null, reviewer_role: 'doctor' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit rating');
      console.log('[DoctorCoverage] Review submitted successfully for session:', session.id);
      onReviewSubmitted(session.id);
    } catch (e: any) {
      console.log('[DoctorCoverage] Review submission error:', e.message);
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const statusSheetLabel = session.status === 'cancelled' ? 'CANCELLED SHIFT' : 'COMPLETED SHIFT';
  const financialRows = [
    { label: 'Amount', value: `₦${Number((session as any).total_cost ?? session.price ?? 0).toLocaleString()}`, bold: true },
    { label: 'Settlement', value: settlementStatus, bold: true },
    { label: 'Started', value: formatDateTime(session.started_at), bold: true },
    { label: 'Ended', value: formatDateTime(session.ended_at), bold: true },
    { label: 'Completed', value: formatDate(session.ended_at ?? session.updated_at), bold: true },
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
              {/* Drag handle — tapping or dragging down closes */}
              <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <View
                  {...panResponder.panHandlers}
                  style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#636366' }}
                />
              </TouchableOpacity>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, paddingTop: 8 }}>
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
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759', marginHorizontal: 5 }} />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#34C759' }}>{reliabilityDisplay}{'%'}</Text>
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
                      <Text style={{ fontSize: 14, color: '#FFFFFF', fontFamily: 'Inter_700Bold' }}>{row.value}</Text>
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
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
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
  const [selectedHistorySession, setSelectedHistorySession] = useState<CoverageSession | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  // Sync fetched data into local state
  useEffect(() => {
    if (upcomingData) setUpcomingSessions(upcomingData);
  }, [upcomingData]);

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

  const handleReviewSubmitted = useCallback((sessionId: string) => {
    console.log('[DoctorCoverage] Review submitted, marking session as reviewed:', sessionId);
    setReviewedIds(prev => new Set([...prev, sessionId]));
  }, []);

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
            <HistoryCoverageCard
              key={session.id}
              session={session}
              onPress={(s) => {
                console.log('[DoctorCoverage] History session selected:', s.id);
                setSelectedHistorySession(s);
              }}
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
      <HistoryDetailSheet
        session={selectedHistorySession}
        visible={selectedHistorySession !== null}
        onClose={() => setSelectedHistorySession(null)}
        alreadyReviewed={selectedHistorySession ? reviewedIds.has(selectedHistorySession.id) : false}
        onReviewSubmitted={handleReviewSubmitted}
      />
    </ScrollView>
  );
}

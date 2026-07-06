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
  TouchableWithoutFeedback,
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

// ─── RatingOverlay ────────────────────────────────────────────────────────────

interface RatingOverlayProps {
  visible: boolean;
  session: CoverageSession;
  onClose: () => void;
  onReviewed: (sessionId: string) => void;
}

function RatingOverlay({ visible, session, onClose, onReviewed }: RatingOverlayProps) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const doctorFirstName = (session.doctor_name ?? '').replace(/^Dr\.?\s*/i, '');

  const handleSubmit = async () => {
    if (stars === 0) {
      setError('Please select a star rating');
      return;
    }
    console.log('[RequesterCoverage] Submitting review for session:', session.id, 'stars:', stars);
    setSubmitting(true);
    setError('');
    try {
      const token = await getValidToken();
      const res = await fetch(`${EDGE_BASE}/submit-review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, stars, comment: comment || undefined }),
      });
      console.log('[RequesterCoverage] submit-review response:', res.status);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as any).error || 'Failed to submit review');
      }
      const data = await res.json();
      console.log('[RequesterCoverage] Review submitted successfully:', data?.review?.id);
      onReviewed(session.id);
      onClose();
    } catch (e: any) {
      console.log('[RequesterCoverage] Review submission error:', e.message);
      setError(e.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
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
                    const filled = star <= stars;
                    return (
                      <TouchableOpacity
                        key={star}
                        onPress={() => {
                          console.log('[RequesterCoverage] Star pressed:', star);
                          setStars(star);
                          setError('');
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
                {error !== '' && (
                  <Text style={{ fontSize: 12, color: '#FF3B30', textAlign: 'center', marginBottom: 8, fontFamily: 'Inter_400Regular' }}>
                    {error}
                  </Text>
                )}

                {/* Comment */}
                <TextInput
                  value={comment}
                  onChangeText={setComment}
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
                    console.log('[RequesterCoverage] Submit Review pressed, stars:', stars);
                    handleSubmit();
                  }}
                  disabled={submitting}
                  style={{
                    backgroundColor: '#1C1C1E',
                    borderRadius: 999,
                    paddingVertical: 16,
                    alignItems: 'center',
                    marginBottom: 12,
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>Submit Review</Text>
                  )}
                </TouchableOpacity>

                {/* Skip */}
                <TouchableOpacity
                  onPress={() => {
                    console.log('[RequesterCoverage] Skip rating pressed');
                    onClose();
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
  );
}

// ─── RequesterCard ────────────────────────────────────────────────────────────

interface RequesterCardProps {
  session: CoverageSession;
  showRateNow: boolean;
  onRateNow: () => void;
}

function RequesterCard({ session, showRateNow, onRateNow }: RequesterCardProps) {
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
          opacity: 0.7,
        },
        Platform.OS === 'ios'
          ? { boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }
          : { elevation: 3 },
      ]}
    >
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }} numberOfLines={1}>
          {session.doctor_name}
        </Text>

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

        <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#71717A', marginTop: 3 }} numberOfLines={1}>
          {shiftSummary}
        </Text>

        {session.ended_at && (
          <Text style={{ fontSize: 12, color: '#A1A1AA', marginTop: 8 }}>
            {'Ended: '}{new Date(session.ended_at).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        )}

        {showRateNow && (
          <TouchableOpacity
            onPress={() => {
              console.log('[RequesterCoverage] Rate Now pressed for session:', session.id);
              onRateNow();
            }}
            style={{
              marginTop: 14,
              backgroundColor: '#2DC653',
              borderRadius: 999,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>Rate Now</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RequesterCoverageScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [ratingSession, setRatingSession] = useState<CoverageSession | null>(null);

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

  const handleReviewed = useCallback((sessionId: string) => {
    console.log('[RequesterCoverage] Marking session as reviewed:', sessionId);
    setReviewedIds((prev) => new Set([...prev, sessionId]));
  }, []);

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
        sessions.map(session => {
          const showRateNow = session.status === 'requester_paid' && !reviewedIds.has(session.id);
          return (
            <RequesterCard
              key={session.id}
              session={session}
              showRateNow={showRateNow}
              onRateNow={() => {
                console.log('[RequesterCoverage] Opening rating overlay for session:', session.id);
                setRatingSession(session);
              }}
            />
          );
        })
      )}

      {/* Rating overlay */}
      {ratingSession && (
        <RatingOverlay
          visible={true}
          session={ratingSession}
          onClose={() => {
            console.log('[RequesterCoverage] Rating overlay closed');
            setRatingSession(null);
          }}
          onReviewed={handleReviewed}
        />
      )}
    </ScrollView>
  );
}

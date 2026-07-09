import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import type { CoverageSession, DayLog } from '@/contexts/DoctorDispatchContext';

const PLATFORM_FEE_RATE = 0.15;
const EDGE_BASE = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1';

function formatNaira(amount: number): string {
  return `₦${Number(amount).toLocaleString()}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function SectionLabel({ text }: { text: string }) {
  return (
    <Text style={styles.sectionLabel}>{text}</Text>
  );
}

function ReceiptRow({
  label,
  value,
  valueStyle,
  large,
}: {
  label: string;
  value: string;
  valueStyle?: object;
  large?: boolean;
}) {
  return (
    <View style={styles.receiptRow}>
      <Text style={[styles.receiptLabel, large && styles.receiptLabelLarge]}>{label}</Text>
      <Text style={[styles.receiptValue, large && styles.receiptValueLarge, valueStyle]}>{value}</Text>
    </View>
  );
}

export default function PaymentSummaryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const [session, setSession] = useState<CoverageSession | null>(null);
  const [amountPaid, setAmountPaid] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showRatingOverlay, setShowRatingOverlay] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState('');

  const fetchData = useCallback(async () => {
    if (!session_id) {
      setError('No session ID provided.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Fetch session and payment intent in parallel
      const [sessionResult, intentResult] = await Promise.all([
        supabase
          .from('coverage_sessions')
          .select('*')
          .eq('id', session_id)
          .single(),
        supabase
          .from('payment_intents')
          .select('amount_naira, status')
          .eq('session_id', session_id)
          .eq('status', 'paid')
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
      ]);

      if (sessionResult.error) {
        setError('Could not load session details.');
        return;
      }

      setSession(sessionResult.data as CoverageSession);

      if (!intentResult.error && intentResult.data) {
        setAmountPaid(intentResult.data.amount_naira);
      } else {
        // Fall back to session price
        setAmountPaid(sessionResult.data?.price ?? 0);
      }
    } catch (e: any) {
      setError('Something went wrong loading payment details.');
    } finally {
      setLoading(false);
    }
  }, [session_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => {
      setShowRatingOverlay(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [session, session_id]);

  const handleSubmitRating = async () => {
    if (ratingStars === 0) {
      setRatingError('Please select a star rating');
      return;
    }
    setSubmittingRating(true);
    setRatingError('');
    try {
      const res = await fetchWithAuth(`${EDGE_BASE}/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session_id, stars: ratingStars, comment: ratingComment, reviewer_role: 'requester' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit review');
      setShowRatingOverlay(false);
    } catch (e: any) {
      setRatingError(e.message);
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleDone = () => {
    router.replace('/(doctor)/(home)');
  };

  if (!fontsLoaded) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#34C759" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={handleDone} style={styles.doneButton}>
          <Text style={styles.doneButtonText}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Derived values ───────────────────────────────────────────────────────
  const totalAmount = amountPaid ?? session?.price ?? 0;
  const platformFee = Math.round(totalAmount * PLATFORM_FEE_RATE);
  const netPayout = totalAmount - platformFee;

  const totalAmountDisplay = totalAmount > 0 ? formatNaira(totalAmount) : '—';
  const platformFeeDisplay = totalAmount > 0 ? formatNaira(platformFee) : '—';
  const netPayoutDisplay = totalAmount > 0 ? formatNaira(netPayout) : '—';

  // Booked shift summary
  const shiftStartDate = session?.shift_date ? formatDate(session.shift_date) : '—';
  const shiftStartTime = session?.shift_start ? formatTime(session.shift_start) : '—';
  const shiftEndTime = session?.shift_end ? formatTime(session.shift_end) : '—';
  const coverageLength = session?.coverage_length ?? 1;
  const perDayHours = session?.per_day_hours ?? 0;
  const bookedHoursDisplay = perDayHours > 0
    ? `${perDayHours}h/day`
    : session ? `${shiftStartTime} – ${shiftEndTime}` : '—';

  // Multi-day end date
  let dateRangeDisplay = shiftStartDate;
  if (session && coverageLength > 1) {
    const endDateObj = new Date(session.shift_date + 'T12:00:00');
    endDateObj.setDate(endDateObj.getDate() + coverageLength - 1);
    const endDateStr = endDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    dateRangeDisplay = `${shiftStartDate} – ${endDateStr}`;
  }

  // Actual shift summary from day_logs
  const dayLogs: DayLog[] = session?.day_logs ?? [];
  const totalActualSeconds = dayLogs.reduce((sum, log) => sum + (log.duration_seconds ?? 0), 0);
  const totalActualDisplay = totalActualSeconds > 0 ? formatDuration(totalActualSeconds) : '—';

  // Booked total hours
  const bookedTotalHours = perDayHours > 0 ? perDayHours * coverageLength : 0;
  const actualHours = totalActualSeconds / 3600;
  const overage = actualHours - bookedTotalHours;
  const hasOverage = bookedTotalHours > 0 && overage > 0.1;
  const overageDisplay = hasOverage ? `+${formatDuration(Math.round(overage * 3600))} overage` : null;

  const hospitalName = session?.hospital_name ?? '—';
  const shiftType = session?.shift_type ?? '—';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.successBadge}>
            <View style={styles.successDot} />
            <Text style={styles.successBadgeText}>Payment Confirmed</Text>
          </View>
          <Text style={styles.headerTitle}>Payment Summary</Text>
          <Text style={styles.headerSubtitle}>{hospitalName}</Text>
        </View>

        {/* ── Payout Breakdown ── */}
        <View style={styles.card}>
          <SectionLabel text="PAYOUT BREAKDOWN" />

          <ReceiptRow label="Total Amount Charged" value={totalAmountDisplay} />
          <View style={styles.divider} />
          <ReceiptRow
            label="Platform Fee (15%)"
            value={totalAmount > 0 ? `-${platformFeeDisplay}` : '—'}
            valueStyle={{ color: '#FF453A' }}
          />
          <View style={styles.divider} />

          {/* Net payout — highlighted */}
          <View style={styles.netPayoutRow}>
            <Text style={styles.netPayoutLabel}>Your Net Payout</Text>
            <Text style={styles.netPayoutValue}>{netPayoutDisplay}</Text>
          </View>
        </View>

        {/* ── Booked Shift Summary ── */}
        <View style={styles.card}>
          <SectionLabel text="BOOKED SHIFT" />

          <ReceiptRow label="Shift Type" value={shiftType} />
          <View style={styles.divider} />
          <ReceiptRow label="Date(s)" value={dateRangeDisplay} />
          <View style={styles.divider} />
          <ReceiptRow label="Hours Per Day" value={bookedHoursDisplay} />
          {coverageLength > 1 && (
            <>
              <View style={styles.divider} />
              <ReceiptRow label="Coverage Length" value={`${coverageLength} days`} />
            </>
          )}
        </View>

        {/* ── Actual Shift Summary ── */}
        <View style={styles.card}>
          <SectionLabel text="ACTUAL SHIFT" />

          {dayLogs.length > 0 ? (
            dayLogs.map((log, index) => (
              <View key={log.day}>
                {index > 0 && <View style={styles.divider} />}
                <ReceiptRow
                  label={coverageLength > 1 ? `Day ${log.day}` : 'Hours Worked'}
                  value={formatDuration(log.duration_seconds ?? 0)}
                />
              </View>
            ))
          ) : (
            <ReceiptRow label="Hours Worked" value={totalActualDisplay} />
          )}

          {hasOverage && overageDisplay && (
            <>
              <View style={styles.divider} />
              <View style={styles.overageRow}>
                <Text style={styles.overageLabel}>Overage</Text>
                <Text style={styles.overageValue}>{overageDisplay}</Text>
              </View>
            </>
          )}
        </View>

        {/* ── Payout Info Box ── */}
        <View style={styles.infoBox}>
          <Text style={styles.infoBoxIcon}>🏦</Text>
          <Text style={styles.infoBoxText}>
            Your payout will be processed and credited to your account by 10:00 PM tonight.
          </Text>
        </View>
      </ScrollView>

      {/* ── Done Button ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          onPress={handleDone}
          activeOpacity={0.85}
          style={styles.doneButton}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* ── Rating Overlay ── */}
      <Modal
        visible={showRatingOverlay}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <TouchableWithoutFeedback onPress={() => {
          setShowRatingOverlay(false);
        }}>
          <View style={styles.ratingBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.ratingCard}>
                <Text style={styles.ratingHeader}>
                  {`How was your experience with ${session?.hospital_name ?? 'the hospital'}?`}
                </Text>
                <Text style={styles.ratingSubheader}>
                  Share your feedback and help us improve.
                </Text>

                {/* Stars */}
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => {
                    const filled = star <= ratingStars;
                    const starColor = filled ? '#F4A261' : '#D4D4D8';
                    return (
                      <TouchableOpacity
                        key={star}
                        onPress={() => {
                          setRatingStars(star);
                          setRatingError('');
                        }}
                        activeOpacity={0.7}
                        style={styles.starButton}
                      >
                        <Text style={[styles.starIcon, { color: starColor }]}>★</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {ratingError !== '' && (
                  <Text style={styles.ratingErrorText}>{ratingError}</Text>
                )}

                <TextInput
                  style={styles.ratingInput}
                  placeholder="Write a comment (optional)..."
                  placeholderTextColor="#A1A1AA"
                  multiline
                  value={ratingComment}
                  onChangeText={setRatingComment}
                  textAlignVertical="top"
                />

                <View style={styles.ratingButtonRow}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowRatingOverlay(false);
                    }}
                    activeOpacity={0.8}
                    style={styles.skipButton}
                  >
                    <Text style={styles.skipButtonText}>Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSubmitRating}
                    activeOpacity={0.85}
                    disabled={submittingRating}
                    style={[styles.submitButton, submittingRating && { opacity: 0.5 }]}
                  >
                    {submittingRating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitButtonText}>Submit Review</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  header: {
    marginBottom: 24,
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  successDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  successBadgeText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#34C759',
    letterSpacing: 0.3,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    color: '#000000',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#8E8E93',
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 16,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  receiptLabel: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#3C3C43',
    flex: 1,
  },
  receiptLabelLarge: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#000000',
  },
  receiptValue: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#000000',
    textAlign: 'right',
  },
  receiptValueLarge: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
  },
  netPayoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: '#F0FFF4',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  netPayoutLabel: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#1A7A3A',
  },
  netPayoutValue: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#34C759',
  },
  overageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  overageLabel: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#3C3C43',
  },
  overageValue: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF9500',
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoBoxIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#1D4ED8',
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#F2F2F7',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  doneButton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
  },
  ratingBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 24,
    width: '100%',
    maxWidth: 400,
  },
  ratingHeader: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#1C1C1E',
    lineHeight: 26,
  },
  ratingSubheader: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#71717A',
    marginTop: 6,
    lineHeight: 20,
  },
  starsRow: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 8,
  },
  starButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starIcon: {
    fontSize: 28,
    lineHeight: 32,
  },
  ratingErrorText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#DC2626',
    marginTop: 8,
  },
  ratingInput: {
    marginTop: 16,
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#1C1C1E',
  },
  ratingButtonRow: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  skipButton: {
    flex: 1,
    backgroundColor: '#F4F4F5',
    borderRadius: 99,
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#71717A',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 99,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
});

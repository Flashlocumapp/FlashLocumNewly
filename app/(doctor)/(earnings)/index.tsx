import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DoctorEarning } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '@/constants/Theme';
import { BodyScrollView } from '@/components/BodyScrollView';
import { AnimatedPressable } from '@/components/AnimatedPressable';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatNaira(amount: number): string {
  const rounded = Math.round(Number(amount));
  return `₦${rounded.toLocaleString('en-NG')}`;
}

function formatShiftDate(isoString: string | null): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatShiftType(row: DoctorEarning): string {
  const type = row.coverage_type ?? 'Standard';
  const hours = Number(row.per_day_hours) * Number(row.coverage_length);
  const hoursLabel = hours % 1 === 0 ? `${hours}hrs` : `${hours.toFixed(1)}hrs`;
  return `${type} · ${hoursLabel}`;
}

function getThisMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

const ELIGIBLE_STATUSES = ['requester_paid', 'completed'];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const isPaidOut = status === 'completed';
  const label = isPaidOut ? 'Paid Out' : 'Awaiting Disbursement';
  const bgColor = isPaidOut ? '#1A4A2A' : '#4A2E0A';
  const textColor = isPaidOut ? '#34C759' : '#F4A261';
  const borderColor = isPaidOut ? '#34C759' : '#F4A261';

  return (
    <View style={[styles.badge, { backgroundColor: bgColor, borderColor }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>
        {label}
      </Text>
    </View>
  );
}

function EarningRow({ row }: { row: DoctorEarning }) {
  const shiftDate = formatShiftDate(row.paid_at ?? row.start_time);
  const shiftType = formatShiftType(row);
  const totalCharged = formatNaira(row.total_amount_naira);
  const platformFee = formatNaira(row.platform_fee_naira);
  const netPayout = formatNaira(row.net_payout_naira);

  return (
    <AnimatedPressable
      style={styles.earningRow}
      onPress={() => {
        console.log('[EarningsScreen] Earning row pressed — session_id:', row.session_id);
      }}
    >
      {/* Top row: date + status badge */}
      <View style={styles.rowTopLine}>
        <Text style={styles.shiftDate}>{shiftDate}</Text>
        <StatusBadge status={row.session_status} />
      </View>

      {/* Shift type */}
      <Text style={styles.shiftType}>{shiftType}</Text>

      {/* Fee breakdown */}
      <View style={styles.feeBreakdown}>
        <View style={styles.feeItem}>
          <Text style={styles.feeLabel}>Total charged</Text>
          <Text style={styles.feeValue}>{totalCharged}</Text>
        </View>
        <View style={styles.feeDivider} />
        <View style={styles.feeItem}>
          <Text style={styles.feeLabel}>Platform fee</Text>
          <Text style={styles.feeMuted}>
            {'-'}
            {platformFee}
          </Text>
        </View>
      </View>

      {/* Net payout — prominent */}
      <View style={styles.netPayoutRow}>
        <Text style={styles.netPayoutLabel}>Net payout</Text>
        <Text style={styles.netPayoutValue}>{netPayout}</Text>
      </View>
    </AnimatedPressable>
  );
}

function SummaryCard({
  totalAllTime,
  totalThisMonth,
  loading,
}: {
  totalAllTime: number;
  totalThisMonth: number;
  loading: boolean;
}) {
  const allTimeDisplay = formatNaira(totalAllTime);
  const thisMonthDisplay = formatNaira(totalThisMonth);

  return (
    <View style={styles.summaryCard}>
      {/* Decorative accent circles */}
      <View style={styles.accentCircle1} />
      <View style={styles.accentCircle2} />

      <View style={styles.summaryContent}>
        {/* Total all time */}
        <View style={styles.summaryMainBlock}>
          <Text style={styles.summaryMainLabel}>Total Earned (All Time)</Text>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" style={{ marginTop: 4 }} />
          ) : (
            <Text style={styles.summaryMainValue}>{allTimeDisplay}</Text>
          )}
        </View>

        {/* Divider */}
        <View style={styles.summaryDivider} />

        {/* This month */}
        <View style={styles.summarySecondaryBlock}>
          <Text style={styles.summarySecondaryLabel}>Earned This Month</Text>
          {loading ? (
            <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" style={{ marginTop: 2 }} />
          ) : (
            <Text style={styles.summarySecondaryValue}>{thisMonthDisplay}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <MaterialIcons name="account-balance-wallet" size={32} color={COLORS.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No earnings yet</Text>
      <Text style={styles.emptySubtitle}>
        Completed shifts will appear here.
      </Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function DoctorEarningsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [earnings, setEarnings] = useState<DoctorEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Derived totals ──────────────────────────────────────────────────────────
  const eligibleRows = earnings.filter(r => ELIGIBLE_STATUSES.includes(r.session_status));

  const totalAllTime = eligibleRows.reduce((sum, r) => sum + Number(r.net_payout_naira), 0);

  const thisMonthStart = getThisMonthStart();
  const totalThisMonth = eligibleRows
    .filter(r => r.paid_at != null && r.paid_at >= thisMonthStart)
    .reduce((sum, r) => sum + Number(r.net_payout_naira), 0);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchEarnings = useCallback(async () => {
    console.log('[EarningsScreen] Fetching doctor_earnings from Supabase');
    try {
      const { data, error: fetchError } = await supabase
        .from('doctor_earnings')
        .select('*')
        .order('paid_at', { ascending: false });

      if (fetchError) {
        console.log('[EarningsScreen] Fetch error:', fetchError.message);
        setError(fetchError.message);
        return;
      }

      console.log('[EarningsScreen] Fetched', data?.length ?? 0, 'earnings rows');
      setEarnings((data as DoctorEarning[]) ?? []);
      setError(null);
    } catch (e: any) {
      console.log('[EarningsScreen] Unexpected fetch error:', e.message);
      setError(e.message);
    }
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchEarnings().finally(() => setLoading(false));
  }, [user, fetchEarnings]);

  // ── Pull-to-refresh ─────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    console.log('[EarningsScreen] Pull-to-refresh triggered');
    setRefreshing(true);
    await fetchEarnings();
    setRefreshing(false);
  }, [fetchEarnings]);

  // ── Realtime: user channel for disbursement_confirmed ───────────────────────
  useEffect(() => {
    if (!user) return;

    const userChannelName = `user:${user.id}`;
    console.log('[EarningsScreen] Subscribing to realtime channel:', userChannelName);

    const ch = supabase
      .channel(userChannelName)
      .on('broadcast', { event: 'disbursement_confirmed' }, (payload) => {
        console.log('[EarningsScreen] disbursement_confirmed received:', payload);
        fetchEarnings();
      })
      .subscribe((status) => {
        console.log('[EarningsScreen] Realtime channel status:', userChannelName, status);
      });

    channelRef.current = ch;

    return () => {
      console.log('[EarningsScreen] Unsubscribing from realtime channel:', userChannelName);
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [user, fetchEarnings]);

  // ── Realtime: Postgres changes on doctor_earnings (fallback) ────────────────
  useEffect(() => {
    if (!user) return;

    const pgChannelName = `doctor_earnings_changes:${user.id}`;
    console.log('[EarningsScreen] Subscribing to Postgres changes channel:', pgChannelName);

    const pgCh = supabase
      .channel(pgChannelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_intents' },
        (payload) => {
          console.log('[EarningsScreen] Postgres change on payment_intents:', payload.eventType);
          fetchEarnings();
        }
      )
      .subscribe((status) => {
        console.log('[EarningsScreen] Postgres changes channel status:', pgChannelName, status);
      });

    return () => {
      console.log('[EarningsScreen] Unsubscribing from Postgres changes channel:', pgChannelName);
      supabase.removeChannel(pgCh);
    };
  }, [user, fetchEarnings]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const paddingBottom = insets.bottom + 100; // space for tab bar

  return (
    <View style={styles.container}>
      <BodyScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: SPACING.base,
          paddingBottom,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Header */}
        <Text style={styles.screenTitle}>Earnings</Text>
        <Text style={styles.screenSubtitle}>Your payout summary</Text>

        {/* Summary card */}
        <SummaryCard
          totalAllTime={totalAllTime}
          totalThisMonth={totalThisMonth}
          loading={loading}
        />

        {/* Section header */}
        <Text style={styles.sectionHeader}>Shift History</Text>

        {/* Error state */}
        {error && (
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={18} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Loading skeleton */}
        {loading && !error && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading earnings…</Text>
          </View>
        )}

        {/* Empty state */}
        {!loading && !error && eligibleRows.length === 0 && <EmptyState />}

        {/* Earnings list */}
        {!loading && !error && eligibleRows.length > 0 && (
          <View style={styles.listContainer}>
            {eligibleRows.map((row) => (
              <EarningRow key={row.session_id} row={row} />
            ))}
          </View>
        )}
      </BodyScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },

  // Header
  screenTitle: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    marginBottom: 4,
  },
  screenSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },

  // Summary card
  summaryCard: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  accentCircle1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -40,
    right: -40,
  },
  accentCircle2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -20,
    left: 20,
  },
  summaryContent: {
    gap: SPACING.base,
  },
  summaryMainBlock: {
    gap: 4,
  },
  summaryMainLabel: {
    ...TYPOGRAPHY.label,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  summaryMainValue: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  summarySecondaryBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summarySecondaryLabel: {
    ...TYPOGRAPHY.caption,
    color: 'rgba(255,255,255,0.7)',
  },
  summarySecondaryValue: {
    ...TYPOGRAPHY.h4,
    color: '#FFFFFF',
  },

  // Section header
  sectionHeader: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },

  // Earning row
  listContainer: {
    gap: SPACING.md,
  },
  earningRow: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    gap: SPACING.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  rowTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shiftDate: {
    ...TYPOGRAPHY.captionMedium,
    color: COLORS.textSecondary,
  },
  shiftType: {
    ...TYPOGRAPHY.bodySemibold,
    color: COLORS.text,
  },

  // Fee breakdown
  feeBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  feeItem: {
    flex: 1,
    gap: 2,
  },
  feeDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },
  feeLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 0.3,
  },
  feeValue: {
    ...TYPOGRAPHY.captionMedium,
    color: COLORS.text,
  },
  feeMuted: {
    ...TYPOGRAPHY.captionMedium,
    color: COLORS.textSecondary,
  },

  // Net payout
  netPayoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  netPayoutLabel: {
    ...TYPOGRAPHY.bodySemibold,
    color: COLORS.text,
  },
  netPayoutValue: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: COLORS.success,
    letterSpacing: -0.2,
  },

  // Badge
  badge: {
    borderRadius: RADIUS.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: SPACING.xxxl,
    gap: SPACING.sm,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h4,
    color: COLORS.text,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 240,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingTop: SPACING.xxxl,
    gap: SPACING.md,
  },
  loadingText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.base,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.danger,
    flex: 1,
  },
});

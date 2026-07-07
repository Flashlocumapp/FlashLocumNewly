import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DoctorEarning } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { BodyScrollView } from '@/components/BodyScrollView';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'this_week' | 'last_week' | 'last_month' | 'last_3_months';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS: Period[] = ['this_week', 'last_week', 'last_month', 'last_3_months'];

const PERIOD_LABELS: Record<Period, string> = {
  this_week: 'THIS WEEK',
  last_week: 'LAST WEEK',
  last_month: 'LAST MONTH',
  last_3_months: 'LAST 3 MONTHS',
};

const PILL_LABELS: Record<Period, string> = {
  this_week: 'This Week',
  last_week: 'Last Week',
  last_month: 'Last Month',
  last_3_months: 'Last 3 Months',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(amount: number): string {
  const rounded = Math.round(Number(amount));
  return `₦${rounded.toLocaleString('en-NG')}`;
}

function formatShiftDate(isoString: string | null): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const datePart = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return datePart + ' at ' + timePart;
}

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  if (period === 'this_week') {
    return { start: monday, end: now };
  }
  if (period === 'last_week') {
    const lastMonday = new Date(monday);
    lastMonday.setDate(monday.getDate() - 7);
    const lastSunday = new Date(monday);
    lastSunday.setMilliseconds(-1);
    return { start: lastMonday, end: lastSunday };
  }
  if (period === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { start, end };
  }
  // last_3_months
  const start = new Date(now);
  start.setMonth(now.getMonth() - 3);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

function isInPeriod(isoDate: string | null | undefined, period: Period): boolean {
  if (!isoDate) return false;
  const { start, end } = getPeriodRange(period);
  const d = new Date(isoDate);
  return d >= start && d <= end;
}

// ─── Transaction Card ─────────────────────────────────────────────────────────

function TransactionCard({
  row,
  expanded,
  onToggle,
}: {
  row: DoctorEarning;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hospitalName = row.hospital_name ?? 'Hospital';
  const isPaid = row.session_status === 'completed';
  const statusDotColor = isPaid ? '#34C759' : '#F4A261';
  const statusLabel = isPaid ? 'PAID' : 'PENDING';
  const statusTextColor = isPaid ? '#34C759' : '#F4A261';
  const shiftDateStr = formatShiftDate(row.paid_at ?? row.start_time);
  const coverageLabel = row.coverage_type ?? 'Standard';
  const subtitleText = coverageLabel + ' · ' + shiftDateStr;
  const netPayoutDisplay = formatNaira(row.net_payout_naira);
  const totalChargedDisplay = formatNaira(row.total_amount_naira);
  const platformFeeDisplay = formatNaira(row.platform_fee_naira);
  const chevron = expanded ? '▴' : '▾';
  const disbursedStatus = isPaid ? 'Disbursed' : 'Awaiting Disbursement';
  const paymentDateDisplay = formatDateTime(row.paid_at);
  const disbursementDateDisplay = formatDateTime(row.disbursed_at);
  const txRef = row.monnify_transaction_reference ?? '—';
  const accountRef = row.monnify_account_reference ?? '—';
  const disbursementRef = row.disbursement_reference ?? '—';

  const detailRows: { label: string; value: string; green?: boolean }[] = [
    { label: 'Transaction Ref', value: txRef },
    { label: 'Account Ref', value: accountRef },
    { label: 'Amount Charged', value: totalChargedDisplay },
    { label: 'Platform Fee (15%)', value: platformFeeDisplay },
    { label: 'Net Payout', value: netPayoutDisplay, green: true },
    { label: 'Payment Date', value: paymentDateDisplay },
    { label: 'Disbursement Date', value: disbursementDateDisplay },
    { label: 'Disbursement Ref', value: disbursementRef },
    { label: 'Status', value: disbursedStatus },
  ];

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => {
        console.log('[EarningsScreen] Transaction card toggled — session_id:', row.session_id, 'expanded:', !expanded);
        onToggle();
      }}
    >
      {/* Collapsed row */}
      <View style={styles.cardRow}>
        {/* Left */}
        <View style={styles.cardLeft}>
          <Text style={styles.cardHospitalName} numberOfLines={1}>{hospitalName}</Text>
          <Text style={styles.cardSubtitle}>{subtitleText}</Text>
        </View>
        {/* Right */}
        <View style={styles.cardRight}>
          <Text style={styles.cardAmount}>{netPayoutDisplay}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
            <Text style={[styles.statusLabel, { color: statusTextColor }]}>{statusLabel}</Text>
          </View>
          <Text style={styles.chevron}>{chevron}</Text>
        </View>
      </View>

      {/* Expanded detail box */}
      {expanded && (
        <View style={styles.detailBox}>
          {detailRows.map((item, index) => {
            const isLast = index === detailRows.length - 1;
            const valueStyle = item.green
              ? [styles.detailValue, styles.detailValueGreen]
              : styles.detailValue;
            return (
              <View
                key={item.label}
                style={[styles.detailRow, isLast ? styles.detailRowLast : null]}
              >
                <Text style={styles.detailLabel}>{item.label}</Text>
                <Text style={valueStyle}>{item.value}</Text>
              </View>
            );
          })}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DoctorEarningsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [earnings, setEarnings] = useState<DoctorEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('this_week');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

  // ── Derived values ──────────────────────────────────────────────────────────
  const filteredRows = earnings.filter(r =>
    isInPeriod(r.paid_at ?? r.start_time, period)
  );

  const settledAmount = earnings
    .filter(r => r.session_status === 'completed' && isInPeriod(r.disbursed_at ?? r.paid_at, period))
    .reduce((sum, r) => sum + Number(r.net_payout_naira), 0);

  const pendingAmount = earnings
    .filter(r => r.session_status === 'requester_paid' && isInPeriod(r.paid_at, period))
    .reduce((sum, r) => sum + Number(r.net_payout_naira), 0);

  const settledDisplay = formatNaira(settledAmount);
  const pendingDisplay = formatNaira(pendingAmount);
  const periodLabel = PERIOD_LABELS[period];
  const summaryLabel = 'SETTLED · ' + periodLabel;

  const paddingBottom = insets.bottom + 100;

  // ── Render ──────────────────────────────────────────────────────────────────
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
        <Text style={styles.screenSubtitle}>Net payouts after the 15% service fee</Text>

        {/* Period pill selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillContainer}
          style={styles.pillScroll}
        >
          {PERIODS.map(p => {
            const isActive = p === period;
            return (
              <TouchableOpacity
                key={p}
                style={[styles.pill, isActive ? styles.pillActive : styles.pillInactive]}
                activeOpacity={0.75}
                onPress={() => {
                  console.log('[EarningsScreen] Period pill pressed:', p);
                  setPeriod(p);
                  setExpandedId(null);
                }}
              >
                <Text style={[styles.pillText, isActive ? styles.pillTextActive : styles.pillTextInactive]}>
                  {PILL_LABELS[p]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{summaryLabel}</Text>
          {loading ? (
            <ActivityIndicator color="#1C1C1E" size="small" style={{ marginVertical: 8 }} />
          ) : (
            <Text style={styles.summaryAmount}>{settledDisplay}</Text>
          )}
          {pendingAmount > 0 && (
            <View style={styles.pendingRow}>
              <View style={styles.pendingDot} />
              <Text style={styles.pendingText}>
                {pendingDisplay}
                {' pending remittance'}
              </Text>
            </View>
          )}
        </View>

        {/* Section label */}
        <Text style={styles.sectionHeader}>TRANSACTIONS</Text>

        {/* Error state */}
        {error && (
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={18} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Loading */}
        {loading && !error && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading earnings…</Text>
          </View>
        )}

        {/* Empty state */}
        {!loading && !error && filteredRows.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No transactions in this period.</Text>
          </View>
        )}

        {/* Transaction list */}
        {!loading && !error && filteredRows.length > 0 && (
          <View style={styles.listContainer}>
            {filteredRows.map(row => (
              <TransactionCard
                key={row.session_id}
                row={row}
                expanded={expandedId === row.session_id}
                onToggle={() => setExpandedId(prev => prev === row.session_id ? null : row.session_id)}
              />
            ))}
          </View>
        )}
      </BodyScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },

  // Header
  screenTitle: {
    fontSize: 34,
    fontFamily: 'Inter_700Bold',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    marginBottom: 20,
  },

  // Pills
  pillScroll: {
    marginBottom: 20,
  },
  pillContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pillActive: {
    backgroundColor: '#1C1C1E',
  },
  pillInactive: {
    backgroundColor: '#F0F0F0',
  },
  pillText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillTextInactive: {
    color: '#1C1C1E',
  },

  // Summary card
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#8E8E93',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 40,
    fontFamily: 'Inter_700Bold',
    color: '#1C1C1E',
    letterSpacing: -1,
    marginBottom: 8,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  pendingText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
  },

  // Section header
  sectionHeader: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#8E8E93',
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  // Transaction list
  listContainer: {
    gap: 0,
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
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
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardHospitalName: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#1C1C1E',
    marginBottom: 3,
  },
  cardSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  cardAmount: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#1C1C1E',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  chevron: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },

  // Detail box
  detailBox: {
    backgroundColor: '#F4F4F4',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    flex: 1,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#1C1C1E',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 12,
  },
  detailValueGreen: {
    color: '#34C759',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: SPACING.xxxl,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
    textAlign: 'center',
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingTop: SPACING.xxxl,
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
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
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: COLORS.danger,
    flex: 1,
  },
});

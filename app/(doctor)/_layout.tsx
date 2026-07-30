import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  StyleSheet,
  Modal,
  TextInput,
  Keyboard,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { Stack, Tabs, Href, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import DoctorTabBar, { DoctorTabItem } from '@/components/DoctorTabBar';
import { DoctorDispatchContext, CoverageSession, registerResetCallback } from '@/contexts/DoctorDispatchContext';
import { getCached, setCached, invalidate, isStale, setPrefetchPromise, clearPrefetchPromise } from '@/utils/tabCache';
import PollingManager from '../../utils/pollingManager';


const EDGE_BASE = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1';

// ─── Background tab prefetch ──────────────────────────────────────────────────
async function prefetchTabData(userId: string) {
  const coverageUpcomingKey = `doctor-coverage-upcoming-${userId}`;
  const coverageHistoryKey = `doctor-coverage-history-${userId}`;
  const earningsKey = `doctor_earnings:${userId}`;

  await Promise.allSettled([
    // 1. Coverage — Upcoming
    (async () => {
      if (!isStale(coverageUpcomingKey)) return;
      const promise = (async (): Promise<void> => {
        try {
          console.log('[prefetch] fetching doctor coverage upcoming');
          const res = await fetchWithAuth(
            `${EDGE_BASE}/get-coverage-sessions?role=doctor&status=upcoming,paused,payment_pending`
          );
          const json = await res.json();
          setCached(coverageUpcomingKey, json?.sessions ?? []);
          console.log('[prefetch] doctor coverage upcoming cached', (json?.sessions ?? []).length, 'sessions');
        } catch (e) {
          console.log('[prefetch] doctor coverage upcoming failed (silent)', e);
        } finally {
          clearPrefetchPromise(coverageUpcomingKey);
        }
      })();
      setPrefetchPromise(coverageUpcomingKey, promise);
      await promise;
    })(),

    // 2. Coverage — History
    (async () => {
      if (!isStale(coverageHistoryKey)) return;
      const promise = (async (): Promise<void> => {
        try {
          console.log('[prefetch] fetching doctor coverage history');
          const res = await fetchWithAuth(
            `${EDGE_BASE}/get-coverage-sessions?role=doctor&status=completed,cancelled,requester_paid,settled`
          );
          const json = await res.json();
          setCached(coverageHistoryKey, json?.sessions ?? []);
          console.log('[prefetch] doctor coverage history cached', (json?.sessions ?? []).length, 'sessions');
        } catch (e) {
          console.log('[prefetch] doctor coverage history failed (silent)', e);
        } finally {
          clearPrefetchPromise(coverageHistoryKey);
        }
      })();
      setPrefetchPromise(coverageHistoryKey, promise);
      await promise;
    })(),

    // 3. Earnings
    (async () => {
      if (!isStale(earningsKey)) return;
      try {
        console.log('[prefetch] fetching doctor earnings');
        const { data, error } = await supabase
          .from('doctor_earnings')
          .select('*')
          .eq('doctor_id', userId)
          .order('paid_at', { ascending: false });
        if (error) throw error;
        setCached(earningsKey, data ?? []);
        console.log('[prefetch] doctor earnings cached', (data ?? []).length, 'rows');
      } catch (e) {
        console.log('[prefetch] doctor earnings failed (silent)', e);
      }
    })(),
  ]);
}

// Module-level GPS cache for go-online/heartbeat — written by the location watcher
let _layoutCachedCoords: { lat: number; lng: number } | null = null;

// Tracks the user's intended online state during an in-flight toggle.
// null = no toggle in flight. true/false = user tapped and backend is processing.
let _toggleIntent: boolean | null = null;

// ─── Persistent deduplication for doctor rating overlay ──────────────────────
const DOCTOR_RATED_SESSIONS_KEY = 'doctor_rated_sessions_v1';
const DOCTOR_DISMISSED_SESSIONS_KEY = 'doctor_dismissed_sessions_v1';
// Layer 1: synchronous in-memory Set — blocks concurrent triggers instantly
const _doctorRatedSessions = new Set<string>();
// Layer 1b: dismissed-without-rating sessions — overlay will NOT re-appear for these
const _doctorDismissedSessions = new Set<string>();
// Module-level promise for the warm-up — allows PAYMENT_CONFIRMED handlers that arrive
// before warm-up completes to await it instead of being silently dropped.
let _doctorWarmPromise: Promise<void> | null = null;

async function markDoctorSessionDismissed(sessionId: string) {
  _doctorDismissedSessions.add(sessionId);
  try {
    const existing = await AsyncStorage.getItem(DOCTOR_DISMISSED_SESSIONS_KEY);
    const arr: string[] = existing ? JSON.parse(existing) : [];
    if (!arr.includes(sessionId)) {
      arr.push(sessionId);
      await AsyncStorage.setItem(DOCTOR_DISMISSED_SESSIONS_KEY, JSON.stringify(arr.slice(-50)));
    }
  } catch {}
}

async function warmDoctorDismissedCache() {
  try {
    const existing = await AsyncStorage.getItem(DOCTOR_DISMISSED_SESSIONS_KEY);
    const arr: string[] = existing ? JSON.parse(existing) : [];
    arr.forEach(id => _doctorDismissedSessions.add(id));
  } catch {}
}

async function markDoctorSessionRated(sessionId: string) {
  _doctorRatedSessions.add(sessionId);
  try {
    const existing = await AsyncStorage.getItem(DOCTOR_RATED_SESSIONS_KEY);
    const arr: string[] = existing ? JSON.parse(existing) : [];
    if (!arr.includes(sessionId)) {
      arr.push(sessionId);
      await AsyncStorage.setItem(DOCTOR_RATED_SESSIONS_KEY, JSON.stringify(arr.slice(-50)));
    }
  } catch {}
}

async function isDoctorSessionRated(sessionId: string): Promise<boolean> {
  // Synchronous check first — no async gap
  if (_doctorRatedSessions.has(sessionId)) return true;
  try {
    const existing = await AsyncStorage.getItem(DOCTOR_RATED_SESSIONS_KEY);
    const arr: string[] = existing ? JSON.parse(existing) : [];
    if (arr.includes(sessionId)) {
      _doctorRatedSessions.add(sessionId);
      return true;
    }
  } catch {}
  return false;
}

// Warm the in-memory cache from AsyncStorage on app start
async function warmDoctorRatedCache() {
  try {
    const existing = await AsyncStorage.getItem(DOCTOR_RATED_SESSIONS_KEY);
    const arr: string[] = existing ? JSON.parse(existing) : [];
    arr.forEach(id => _doctorRatedSessions.add(id));
  } catch {}
}

// POLL_INTERVAL: 5s in dev (Expo Go WebSocket unreliable), 10s in production.
// Cost at 10s: 6 req/min per online doctor. Realtime is the primary delivery path (zero cost).
const POLL_INTERVAL = __DEV__ ? 5000 : 10000;

type DoctorScreenState = 'idle' | 'incoming' | 'confirmed';

type DispatchRequest = {
  id: string;
  requester_id: string;
  hospital_name: string;
  hospital_address: string;
  shift_type: 'Standard' | 'Home Care';
  shift_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  coverage_length: number;
  environment: 'Normal' | 'Busy';
  note?: string | null;
  price: number;
  expiry_at?: string;
  requester_rating?: number | null;
  requester_reliability?: number | null;
};

function formatHHMM(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mPad = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${h12}:${String(m).padStart(2, '0')}${period}`;
}

function formatShiftSummary(req: DispatchRequest): string {
  const sep = ' · ';
  const coverageLength = Math.max(1, req.coverage_length ?? 1);
  const startDate = new Date(req.shift_date + 'T12:00:00');

  // Parse per-day hours from start_time / end_time (HH:MM strings)
  const [sh, sm] = req.start_time.split(':').map(Number);
  const [eh, em] = req.end_time.split(':').map(Number);
  let perDayHours = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (perDayHours <= 0) perDayHours = 24; // same-time = straight 24h per day
  const totalHours = perDayHours * coverageLength;
  const hoursLabel = totalHours % 1 === 0 ? `${totalHours}hr` : `${totalHours.toFixed(1)}hr`;

  const startFormatted = formatHHMM(req.start_time);
  const endFormatted = formatHHMM(req.end_time);
  const priceDisplay = `₦${Number(req.price).toLocaleString()}`;

  if (coverageLength > 1) {
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + coverageLength - 1);
    const startDay = startDate.toLocaleDateString('en-US', { weekday: 'short' });
    const endDay = endDate.toLocaleDateString('en-US', { weekday: 'short' });
    return `${req.shift_type}${sep}${startDay} - ${endDay}${sep}${startFormatted} - ${endFormatted}${sep}${hoursLabel}${sep}${priceDisplay}${sep}Day 1 of ${coverageLength}`;
  }

  const dayLabel = startDate.toLocaleDateString('en-US', { weekday: 'short' });
  return `${req.shift_type}${sep}${dayLabel}${sep}${startFormatted} - ${endFormatted}${sep}${hoursLabel}${sep}${priceDisplay}`;
}

function ShiftDetails({ request, note }: { request: DispatchRequest | null; note: string | null }) {
  if (!request) return null;

  const coverageLength = Math.max(1, request.coverage_length ?? 1);
  const [sh, sm] = request.start_time.split(':').map(Number);
  const [eh, em] = request.end_time.split(':').map(Number);
  let perDayHours = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (perDayHours <= 0) perDayHours = 24;
  const totalHours = perDayHours * coverageLength;
  const hoursLabel = totalHours % 1 === 0 ? `${totalHours}hr` : `${totalHours.toFixed(1)}hr`;

  const startDate = new Date(request.shift_date + 'T12:00:00');
  const startDay = startDate.toLocaleDateString('en-US', { weekday: 'short' });
  const startFormatted = formatHHMM(request.start_time);
  const endFormatted = formatHHMM(request.end_time);
  const priceDisplay = `₦${Number(request.price).toLocaleString()}`;

  return (
    <View style={{ marginTop: 8 }}>
      {/* Single row: shift type • day • time range • duration • price */}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <Text style={{ color: '#8E8E93', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
          {request.shift_type}
        </Text>
        <Text style={{ color: '#8E8E93', fontSize: 13 }}> · </Text>
        <Text style={{ color: '#8E8E93', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
          {startDay}
        </Text>
        <Text style={{ color: '#8E8E93', fontSize: 13 }}> · </Text>
        <Text style={{ color: '#8E8E93', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
          {startFormatted} – {endFormatted}
        </Text>
        <Text style={{ color: '#8E8E93', fontSize: 13 }}> · </Text>
        <Text style={{ color: '#8E8E93', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
          {hoursLabel}
        </Text>
        <Text style={{ color: '#8E8E93', fontSize: 13 }}> · </Text>
        <Text style={{ color: '#8E8E93', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
          {priceDisplay}
        </Text>
      </View>

      {/* Note section — only if present */}
      {!!note && (
        <View style={{
          marginTop: 12,
          backgroundColor: '#2C2C2E',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}>
          <Text style={{ color: '#8E8E93', fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 3 }}>
            NOTE
          </Text>
          <Text style={{ color: '#EBEBF5', fontSize: 13, fontFamily: 'Inter_400Regular', fontStyle: 'italic' }}>
            {note}
          </Text>
        </View>
      )}
    </View>
  );
}

function FeeRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
      <Text style={{ fontSize: 14, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{label}</Text>
      <Text style={{ fontSize: 14, color: valueColor || '#FFFFFF', fontFamily: 'Inter_700Bold' }}>{value}</Text>
    </View>
  );
}

const TABS: DoctorTabItem[] = [
  { name: '(home)', route: '/(doctor)/(home)' as Href, icon: 'home', label: 'Home' },
  { name: '(coverage)', route: '/(doctor)/(coverage)' as Href, icon: 'access-time', label: 'Coverage' },
  { name: '(earnings)', route: '/(doctor)/(earnings)' as Href, icon: 'trending-up', label: 'Earnings' },
  { name: '(account)', route: '/(doctor)/(account)' as Href, icon: 'person', label: 'Account' },
];

export default function DoctorLayout() {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const [doctorScreenState, setDoctorScreenState] = useState<DoctorScreenState>('idle');
  const [requestQueue, setRequestQueue] = useState<DispatchRequest[]>([]);
  const [confirmedRequest, setConfirmedRequest] = useState<DispatchRequest | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Active session state
  const [activeSession, setActiveSession] = useState<CoverageSession | null>(null);
  const [activeJobCount, setActiveJobCount] = useState(0);
  const [upcomingSessions, setUpcomingSessions] = useState<CoverageSession[]>([]);
  // Stable session ID — only set when a real ID arrives, never cleared when session becomes null.
  // This prevents the session channel from re-subscribing to 'session:undefined' after payment_confirmed.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Ref always kept in sync with activeSessionId so broadcast handler closures can read the latest value.
  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);

  // Guard 1 — Reactive: force offline when verification_status changes to non-verified
  useEffect(() => {
    const status = profile?.verification_status;
    if (status && status !== 'verified' && isOnline) {
      console.log('[DoctorLayout] verification_status changed to', status, '— forcing offline');
      setIsOnline(false);
      fetchWithAuth(`${EDGE_BASE}/go-offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {});
    }
  }, [profile?.verification_status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Doctor rating overlay state
  const [showDoctorRating, setShowDoctorRating] = useState(false);
  const showDoctorRatingRef = useRef(false);
  // Gate: blocks overlay triggers until AsyncStorage cache is warm
  const warmCompleteRef = useRef(false);
  const [warmComplete, setWarmComplete] = useState(false);
  useEffect(() => { showDoctorRatingRef.current = showDoctorRating; }, [showDoctorRating]);
  const [doctorRatingSessionId, setDoctorRatingSessionId] = useState<string | null>(null);
  const [doctorRatingHospitalName, setDoctorRatingHospitalName] = useState<string>('');
  const [doctorRatingStars, setDoctorRatingStars] = useState(0);
  const [doctorRatingComment, setDoctorRatingComment] = useState('');
  const [submittingDoctorRating, setSubmittingDoctorRating] = useState(false);
  const [doctorRatingError, setDoctorRatingError] = useState('');
  const [doctorRatingAmount, setDoctorRatingAmount] = useState<number>(0);

  // Live doctor scores — seeded from cache to avoid flicker
  const _cachedScores = getCached<{ rating: number; reliability: number }>('doctor_scores');
  const [doctorRatingScore, setDoctorRatingScore] = useState<number | null>(_cachedScores?.rating ?? null);
  const [doctorReliabilityScore, setDoctorReliabilityScore] = useState<number | null>(_cachedScores?.reliability ?? null);

  // ─── Fetch doctor scores on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('doctor_profiles')
          .select('rating, reliability')
          .eq('id', user.id)
          .single();
        if (error) {
          return;
        }
        if (data) {
          setDoctorRatingScore(data.rating ?? null);
          setDoctorReliabilityScore(data.reliability ?? null);
          setCached('doctor_scores', { rating: data.rating ?? 5.0, reliability: data.reliability ?? 100 });
        }
      } catch (e: any) {
        // non-fatal
      }
    })();
  }, [user]);

  const prevIsOnlineRef = useRef<boolean | undefined>(undefined);
  const callEdgeRef = useRef<(fn: string, body?: object) => Promise<Response | null>>(async () => null);
  const forceSyncRef = useRef<() => Promise<void>>(async () => {});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Stable map of upcoming-session channels — never torn down wholesale, only diffed
  const upcomingChannelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());
  const upcomingCoverageChannelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());
  const isOnlineRef = useRef(false);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  // Coords passed from home screen when going online
  const pendingGoOnlineCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  // Background recovery refs
  const wasOnlineRef = useRef(false);
  const doctorBackgroundedAtRef = useRef<number>(0);


  const callEdge = useCallback(async (fn: string, body?: object) => {
    try {
      const res = await fetchWithAuth(`${EDGE_BASE}/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res;
    } catch {
      return null;
    }
  }, []);

  const forceSync = useCallback(async () => {
    if (!user) return;
    try {
      const res = await callEdge('force-sync');
      if (!res || !res.ok) return;
      const data = await res.json();
      const now = new Date();
      const freshRequests = (data.requests ?? []).filter((req: any) => {
        if (req.status && req.status !== 'pending') return false;
        if (req.expiry_at && new Date(req.expiry_at) <= now) return false;
        return true;
      });
      if (freshRequests.length > 0) {
        setRequestQueue(freshRequests);
        setDoctorScreenState('incoming');
      } else {
        setRequestQueue([]);
        setDoctorScreenState((prev) => prev === 'incoming' ? 'idle' : prev);
      }
    } catch (e: any) {
      // non-fatal
    }
  }, [user, callEdge]);

  // ── Central guard: show rating overlay only if session not already rated/dismissed ──
  const maybeShowDoctorRating = useCallback(async (sessionId: string, hospitalName: string, amount?: number) => {
    // Gate: if cache is not yet warm, await the warm promise instead of dropping the event
    if (!warmCompleteRef.current) {
      if (_doctorWarmPromise) await _doctorWarmPromise;
      else return;
    }

    // If overlay is already open, do not reset in-progress input
    if (showDoctorRatingRef.current) return;

    const resolvedSessionId = sessionId || activeSessionIdRef.current || '';
    if (!resolvedSessionId) return;

    // Synchronous dedup — if already rated, skip immediately
    if (_doctorRatedSessions.has(resolvedSessionId)) return;
    // If the doctor already dismissed this overlay once, do not re-show it
    if (_doctorDismissedSessions.has(resolvedSessionId)) return;

    // Async fallback — check AsyncStorage in case in-memory Sets haven't been warmed yet
    try {
      const [ratedRaw, dismissedRaw] = await Promise.all([
        AsyncStorage.getItem(DOCTOR_RATED_SESSIONS_KEY),
        AsyncStorage.getItem(DOCTOR_DISMISSED_SESSIONS_KEY),
      ]);
      const ratedArr: string[] = ratedRaw ? JSON.parse(ratedRaw) : [];
      const dismissedArr: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : [];
      if (ratedArr.includes(resolvedSessionId)) {
        _doctorRatedSessions.add(resolvedSessionId);
        return;
      }
      if (dismissedArr.includes(resolvedSessionId)) {
        _doctorDismissedSessions.add(resolvedSessionId);
        return;
      }
    } catch {}

    // Pre-check DB — if review or dismissal already exists, mark locally and skip overlay entirely
    try {
      const [existingReview, existingDismissal] = await Promise.all([
        supabase.from('shift_reviews').select('id').eq('session_id', resolvedSessionId).eq('reviewer_role', 'doctor').maybeSingle(),
        supabase.from('rating_dismissals').select('id').eq('session_id', resolvedSessionId).eq('user_id', user?.id ?? '').eq('reviewer_role', 'doctor').maybeSingle(),
      ]);
      if (existingReview.data || existingDismissal.data) {
        markDoctorSessionRated(resolvedSessionId);
        markDoctorSessionDismissed(resolvedSessionId);
        setActiveSessionId(null); // session is paid and already handled — stop subscriptions
        return; // review or dismissal exists — never show overlay
      }
    } catch {
      // Non-fatal — proceed to show overlay if DB check fails
    }

    // DB guard: only show overlay if session is genuinely in a paid state
    try {
      const { data: sessionSnap } = await supabase
        .from('coverage_sessions')
        .select('status')
        .eq('id', resolvedSessionId)
        .maybeSingle();
      const paidStatuses = ['requester_paid'];
      if (!sessionSnap || !paidStatuses.includes(sessionSnap.status)) {
        console.log('[Doctor] maybeShowDoctorRating — session not yet paid, suppressing overlay', sessionSnap?.status);
        return;
      }
    } catch {
      // Non-fatal — if DB check fails, suppress overlay to be safe
      console.log('[Doctor] maybeShowDoctorRating — DB status check failed, suppressing overlay');
      return;
    }

    // DB guard passed — session IS paid. Check in-memory dedup sets again (may have been
    // populated by the async AsyncStorage check above while we awaited the DB guard).
    if (_doctorRatedSessions.has(resolvedSessionId) || _doctorDismissedSessions.has(resolvedSessionId)) {
      setActiveSessionId(null); // session is paid and already handled — stop subscriptions
      return;
    }

    // Only reach here if no review exists anywhere
    setDoctorRatingSessionId(resolvedSessionId);
    setDoctorRatingHospitalName(hospitalName);
    setDoctorRatingStars(0);
    setDoctorRatingComment('');
    setDoctorRatingError('');
    setDoctorRatingAmount(amount ?? 0);
    setShowDoctorRating(true);
  }, [activeSessionIdRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch verified settled amount from payment_intents ──
  const fetchVerifiedAmount = useCallback(async (sessionId: string): Promise<number> => {
    try {
      const { data } = await supabase
        .from('payment_intents')
        .select('amount_paid')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data?.amount_paid ?? 0;
    } catch {
      return 0;
    }
  }, []);

  // ── Payment polling: tries get-active-session first, falls back to direct DB query ──
  const startPaymentPolling = useCallback((sessionId: string, hospitalName: string, amount: number) => {
    console.log('[Doctor] startPaymentPolling — dual-check poll (no cap)', { sessionId });
    PollingManager.start('payment-confirm', async () => {
      try {
        // Primary: get-active-session (original working approach)
        const res = await fetchWithAuth(`${EDGE_BASE}/get-active-session?role=doctor`, {});
        if (res.ok) {
          const data = await res.json();
          const snap = data?.session ?? null;
          const paidStatuses = ['requester_paid'];
          if (snap && paidStatuses.includes(snap.status)) {
            console.log('[Doctor] paymentPoll (primary) — paid status confirmed:', snap.status);
            const resolvedHospital = hospitalName || (snap.hospital_name ?? '');
            const resolvedSessionId = sessionId || snap.id;
            const verifiedAmount = await fetchVerifiedAmount(resolvedSessionId);
            const resolvedAmount = verifiedAmount || amount || (snap.total_cost ?? snap.price ?? 0);
            console.log('[Doctor] paymentPoll (primary) — verifiedAmount:', verifiedAmount, 'resolvedAmount:', resolvedAmount);
            void maybeShowDoctorRating(resolvedSessionId, resolvedHospital, resolvedAmount);
            return true;
          }
        }
        // Fallback: query coverage_sessions directly by session ID
        // (covers case where get-active-session no longer returns the session)
        if (sessionId) {
          const { data: snap2 } = await supabase
            .from('coverage_sessions')
            .select('id, status, total_cost, hospital_name')
            .eq('id', sessionId)
            .maybeSingle();
          const paidStatuses = ['requester_paid'];
          if (snap2 && paidStatuses.includes(snap2.status)) {
            console.log('[Doctor] paymentPoll (fallback) — paid status confirmed:', snap2.status);
            const resolvedHospital = hospitalName || (snap2.hospital_name ?? '');
            const verifiedAmount = await fetchVerifiedAmount(sessionId);
            const resolvedAmount = verifiedAmount || amount || (snap2.total_cost ?? 0);
            console.log('[Doctor] paymentPoll (fallback) — verifiedAmount:', verifiedAmount, 'resolvedAmount:', resolvedAmount);
            void maybeShowDoctorRating(sessionId, resolvedHospital, resolvedAmount);
            return true;
          }
        }
      } catch {
        // non-fatal
      }
      return false;
    });
  }, [maybeShowDoctorRating, fetchVerifiedAmount]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPaymentPollingRef = useRef(startPaymentPolling);
  useEffect(() => { startPaymentPollingRef.current = startPaymentPolling; }, [startPaymentPolling]);

  // Reconcile upcoming sessions against server state — only updates if there's a mismatch
  const reconcileUpcoming = useCallback(async () => {
    if (!user?.id) return;
    try {
      console.log('[DoctorLayout] reconcileUpcoming — fetching server state');
      const res = await fetchWithAuth(
        `${EDGE_BASE}/get-coverage-sessions?role=doctor&status=upcoming,paused,payment_pending`,
        { headers: { 'Content-Type': 'application/json' } },
      );
      if (!res.ok) return;
      const data = await res.json();
      const serverSessions: CoverageSession[] = data?.sessions ?? [];
      setUpcomingSessions(prev => {
        const prevIds = [...prev].map(s => s.id).sort().join(',');
        const serverIds = [...serverSessions].map(s => s.id).sort().join(',');
        if (prevIds === serverIds) return prev;
        console.log('[DoctorLayout] reconcileUpcoming — mismatch detected, updating from server');
        return [...serverSessions].sort((a, b) =>
          new Date(a.shift_start).getTime() - new Date(b.shift_start).getTime()
        );
      });
    } catch {
      // non-fatal — realtime remains primary
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable ref so channel handlers can call reconcileUpcoming without stale closures
  const reconcileUpcomingRef = useRef(reconcileUpcoming);
  // Guard ref: true while a start-shift transition is in progress — prevents the background
  // upcoming poll from calling reconcileUpcoming and destroying the coverage channel mid-flight
  const startShiftInProgressRef = useRef(false);
  useEffect(() => { reconcileUpcomingRef.current = reconcileUpcoming; }, [reconcileUpcoming]);

  // Fetch active session from edge function
  const fetchActiveSession = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${EDGE_BASE}/get-active-session?role=doctor`, {});
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      const session: CoverageSession | null = data?.session ?? null;
      const jobCount: number = data?.active_job_count ?? 0;
      const upcoming: CoverageSession[] = data?.upcoming_sessions ?? [];
      setActiveSession(session);
      setActiveJobCount(jobCount);
      setUpcomingSessions(upcoming);
    } catch (e: any) {
      // non-fatal
    }
  }, []);

  // Keep stable refs
  useEffect(() => { callEdgeRef.current = callEdge; }, [callEdge]);
  useEffect(() => { forceSyncRef.current = forceSync; }, [forceSync]);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  // Go online with optional GPS coords from the home screen
  const goOnline = useCallback((coords?: { lat: number; lng: number }) => {
    if (coords) {
      pendingGoOnlineCoordsRef.current = coords;
    }
    setIsOnline(true);
  }, []);

  // ─── Keep activeSessionId in sync — only set, never clear ───────────────────
  useEffect(() => {
    if (activeSession?.id) {
      const terminalStatuses = ['requester_paid', 'settled'];
      if (!terminalStatuses.includes(activeSession.status)) {
        setActiveSessionId(activeSession.id);
      }
    }
    // Intentionally do NOT clear when activeSession becomes null —
    // this keeps the session channel alive after payment_confirmed fires.
  }, [activeSession?.id, activeSession?.status]);

  // On mount — restore session state after app restart
  useEffect(() => {
    if (!user) return;
    // Seed online status from DB — ensures 2AM reset is reflected on next app open
    supabase
      .from('doctor_profiles')
      .select('is_online')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        // Only apply if no user-initiated toggle has occurred yet
        if (_toggleIntent !== null) return;
        if (data && typeof data.is_online === 'boolean') {
          setIsOnline(data.is_online);
        }
      });
    _doctorWarmPromise = Promise.all([warmDoctorRatedCache(), warmDoctorDismissedCache()]).then(() => {
      warmCompleteRef.current = true;
      setWarmComplete(true);
      fetchActiveSession().then(() => {
        // Guard 2 — Boot-time: force offline if doctor is not verified
        const bootStatus = profile?.verification_status;
        if (bootStatus && bootStatus !== 'verified') {
          console.log('[DoctorLayout] boot-time verification gate — status is', bootStatus, '— forcing offline');
          setIsOnline(false);
          fetchWithAuth(`${EDGE_BASE}/go-offline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }).catch(() => {});
        }
        // Fire-and-forget background prefetch — must not block home screen render
        console.log('[DoctorLayout] starting background tab prefetch for user', user.id);
        prefetchTabData(user.id);
      });
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: live is_online sync (catches 2AM daily reset while app is open) ──
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`doctor-online-status:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'doctor_profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const newRow = payload.new as { is_online?: boolean };
          if (typeof newRow.is_online !== 'boolean') return;
          // If a toggle is in flight, only apply if the incoming value matches the intent
          // (i.e. the DB confirmed what we already set). Discard contradicting events.
          if (_toggleIntent !== null && newRow.is_online !== _toggleIntent) return;
          setIsOnline(newRow.is_online);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Register reset callback so AuthContext can clear dispatch state on sign-out
  useEffect(() => {
    registerResetCallback(() => {
      console.log('[DoctorLayout] reset — clearing active session and job count');
      warmCompleteRef.current = false;
      setWarmComplete(false);
      _doctorWarmPromise = null;
      _doctorRatedSessions.clear();
      _doctorDismissedSessions.clear();
      setActiveSession(null);
      setActiveSessionId(null); // clear stale ID so ghost subscriptions don't form on next login
      setActiveJobCount(0);
      setUpcomingSessions([]);
      setIsOnline(false);
      setDoctorScreenState('idle');
      setRequestQueue([]);
      setConfirmedRequest(null);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cleanup PollingManager on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      PollingManager.stopAll();
    };
  }, []);

  // Note: SIGNED_IN re-fetch is intentionally omitted here.
  // The mount effect already handles sign-in correctly by waiting for
  // warmDoctorRatedCache() and warmDoctorDismissedCache() to complete
  // before calling fetchActiveSession(), preventing a race where the
  // rating overlay fires before the in-memory Sets are populated.



  // ── Go-online / Go-offline — only fires when isOnline actually changes ──
  useEffect(() => {
    if (!user) return;
    if (prevIsOnlineRef.current === isOnline) return;
    prevIsOnlineRef.current = isOnline;
    const toggle = async () => {
      _toggleIntent = isOnline;
      const fn = isOnline ? 'go-online' : 'go-offline';
      try {
        const goOnlineBody = isOnline
          ? (pendingGoOnlineCoordsRef.current ?? lastLocationRef.current ?? _layoutCachedCoords ?? undefined)
          : undefined;
        pendingGoOnlineCoordsRef.current = null;
        const res = await callEdgeRef.current(fn, goOnlineBody);
        if (isOnline) {
          if (!res || !res.ok) {
            if (res?.status === 409) {
              const body409 = await res.json().catch(() => ({}));
              if (body409.error === 'CAP_REACHED') {
                Alert.alert('Max Shifts Reached', 'Complete a shift to go online again.');
                setIsOnline(false);
              } else {
                // Non-CAP_REACHED failure — revert silently
                setIsOnline(false);
              }
            } else {
              // Network/server error — revert silently
              setIsOnline(false);
            }
          } else {
            await forceSyncRef.current();
            // Explicitly trigger the card if the sync found requests.
            // Don't rely on the async React re-render cycle — read the ref directly.
            setRequestQueue((current) => {
              if (current.length > 0) {
                setDoctorScreenState('incoming');
              }
              return current; // no change to queue itself
            });
          }
        } else {
          setRequestQueue([]);
          setDoctorScreenState('idle');
        }
      } catch (e: any) {
        // non-fatal — revert silently
        setIsOnline(!isOnline);
      } finally {
        _toggleIntent = null;
      }
    };
    toggle();
  }, [isOnline, user]);

  // ── Polling fallback — dispatch poll (online only) ──
  useEffect(() => {
    if (!isOnline || !user) return;
    const id = setInterval(() => {
      forceSyncRef.current();
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [isOnline, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling fallback — session poll (runs whenever there is an active session) ──
  useEffect(() => {
    if (!activeSessionId || !user) return;
    const id = setInterval(() => {
      fetchActiveSession();
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [activeSessionId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling fallback — upcoming sessions poll (runs whenever there are upcoming sessions) ──
  useEffect(() => {
    if (!upcomingSessions.length || !user) return;
    console.log('[Doctor] upcoming sessions poll — starting interval for', upcomingSessions.length, 'sessions');
    const id = setInterval(() => {
      if (startShiftInProgressRef.current) {
        console.log('[Doctor] upcoming sessions poll — skipping tick, start-shift in progress');
        return;
      }
      console.log('[Doctor] upcoming sessions poll — tick, reconciling');
      reconcileUpcomingRef.current();
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [upcomingSessions.length, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Proactive payment poll — starts whenever session enters payment_pending state ──
  // Ensures overlay fires even if SHIFT_ENDED broadcast was missed
  useEffect(() => {
    if (activeSession?.status !== 'payment_pending') return;
    const sessionId = activeSession.id;
    const hospitalName = activeSession.hospital_name ?? '';
    const amount = (activeSession as CoverageSession & { total_cost?: number }).total_cost ?? 0;
    console.log('[Doctor] session entered payment_pending — starting payment poll proactively', { sessionId });
    startPaymentPollingRef.current(sessionId, hospitalName, amount);
  }, [activeSession?.status, activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime subscription — dispatch channel ──
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('dispatch:lagos')
      .on('broadcast', { event: 'NEW_REQUEST' }, (payload) => {
        const req = payload.payload as DispatchRequest;
        const now = new Date();
        if (req.expiry_at && new Date(req.expiry_at) <= now) {
          return;
        }
        setRequestQueue((prev) => {
          if (prev.some((r) => r.id === req.id)) return prev;
          return [...prev, req];
        });
        // Do NOT check isOnlineRef here — it can be stale.
        // The Queue → state sync effect will transition to 'incoming' when isOnline is true.
      })
      .on('broadcast', { event: 'EVICT_REQUEST' }, (payload) => {
        // Layer 2 — another doctor accepted this request; remove it instantly
        const { request_id } = payload.payload as { request_id: string };
        if (!request_id) return;
        console.log('[Doctor] EVICT_REQUEST received — removing from queue:', request_id);
        setRequestQueue((prev) => prev.filter((r) => r.id !== request_id));
      })
      .on('broadcast', { event: 'WITHDRAW_REQUEST' }, (payload) => {
        // Layer 2 — requester withdrew/edited this request; remove it instantly
        const { request_id } = payload.payload as { request_id: string };
        if (!request_id) return;
        console.log('[Doctor] WITHDRAW_REQUEST received — removing from queue:', request_id);
        setRequestQueue((prev) => prev.filter((r) => r.id !== request_id));
      })
      .subscribe((status) => {
        console.log('[Doctor] dispatch channel subscribe status:', status);
        if (status === 'SUBSCRIBED' && isOnlineRef.current && user) {
          forceSyncRef.current();
        }
      });
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime subscription — session channel (when activeSession changes) ──
  useEffect(() => {
    if (!activeSessionId) {
      if (sessionChannelRef.current) {
        supabase.removeChannel(sessionChannelRef.current);
        sessionChannelRef.current = null;
      }
      return;
    }

    const channelName = `session:${activeSessionId}`;

    // Remove old channel if any
    if (sessionChannelRef.current) {
      supabase.removeChannel(sessionChannelRef.current);
      sessionChannelRef.current = null;
    }

    const ch = supabase.channel(channelName)
      .on('broadcast', { event: 'SHIFT_PAUSED' }, (payload) => {
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated } as CoverageSession));
        }
        // Always re-fetch to confirm — optimistic update fires first, re-fetch corrects within ~300ms
        fetchActiveSession();
        PollingManager.start('pause-confirm', async () => {
          const { data: s } = await supabase
            .from('coverage_sessions')
            .select('status')
            .eq('id', activeSessionIdRef.current ?? '')
            .maybeSingle();
          if (s?.status === 'paused') {
            await fetchActiveSession();
            return true;
          }
          return false;
        });
      })
      .on('broadcast', { event: 'SHIFT_RESUMED' }, (payload) => {
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated, status: 'active' } as CoverageSession));
        }
        // Always re-fetch to confirm — optimistic update fires first, re-fetch corrects within ~300ms
        fetchActiveSession();
        PollingManager.start('resume-confirm', async () => {
          const { data: s } = await supabase
            .from('coverage_sessions')
            .select('status')
            .eq('id', activeSessionIdRef.current ?? '')
            .maybeSingle();
          if (s?.status === 'active') {
            await fetchActiveSession();
            return true;
          }
          return false;
        });
      })
      .on('broadcast', { event: 'SHIFT_ENDED' }, (payload) => {
        const updated = payload?.payload?.session as Partial<CoverageSession> | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated } as CoverageSession));
        }
        // Start polling immediately — if PAYMENT_CONFIRMED broadcast is missed (WebSocket gap,
        // Android background restrictions), polling catches it within 5s
        const sid = (updated as any)?.id ?? activeSessionIdRef.current ?? '';
        const hospital = (updated as any)?.hospital_name ?? '';
        const amt = (updated as any)?.total_cost ?? (updated as any)?.price ?? 0;
        startPaymentPollingRef.current(sid, hospital, amt);
      })
      .on('broadcast', { event: 'PAYMENT_CONFIRMED' }, (payload) => {
        const sessionId = payload?.payload?.session_id ?? activeSessionIdRef.current ?? activeSessionId;
        const hospitalName = payload?.payload?.hospital_name ?? '';
        const amount = payload?.payload?.amount_naira ?? payload?.payload?.total_naira ?? payload?.payload?.price ?? 0;
        console.log('[Doctor] PAYMENT_CONFIRMED broadcast received', { sessionId, hospitalName, amount });
        setActiveSession((prev) => prev ? { ...prev, status: 'requester_paid' } : prev);
        void maybeShowDoctorRating(sessionId ?? '', hospitalName, amount);
        startPaymentPollingRef.current(sessionId ?? '', hospitalName, amount);
        invalidate(`doctor-coverage-history-${user.id}`);
        invalidate(`doctor-coverage-upcoming-${user.id}`);
        invalidate('doctor_earnings');
      })
      .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
        const sessionId = payload?.payload?.session_id ?? activeSessionIdRef.current ?? activeSessionId;
        const hospitalName = payload?.payload?.hospital_name ?? '';
        const amount = payload?.payload?.amount_naira ?? payload?.payload?.total_naira ?? payload?.payload?.price ?? 0;
        console.log('[Doctor] payment_confirmed broadcast received', { sessionId, hospitalName, amount });
        setActiveSession((prev) => prev ? { ...prev, status: 'requester_paid' } : prev);
        void maybeShowDoctorRating(sessionId ?? '', hospitalName, amount);
        startPaymentPollingRef.current(sessionId ?? '', hospitalName, amount);
        invalidate(`doctor-coverage-history-${user.id}`);
        invalidate(`doctor-coverage-upcoming-${user.id}`);
        invalidate('doctor_earnings');
      })
      .on('broadcast', { event: 'PAYMENT_COMPLETE' }, (payload) => {
        setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
      })
      .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
        PollingManager.stop('cancel');
        setActiveSession(null);
        setActiveJobCount((prev) => Math.max(0, prev - 1));
        // Reconcile upcoming — removes any cancelled session from the list
        reconcileUpcomingRef.current();
        PollingManager.start('cancel-confirm', async () => {
          const { data: s } = await supabase
            .from('coverage_sessions')
            .select('status')
            .eq('id', activeSessionIdRef.current ?? '')
            .maybeSingle();
          if (!s || s.status === 'cancelled') {
            reconcileUpcomingRef.current();
            return true;
          }
          return false;
        });
      })
      .subscribe((status) => {
        console.log('[Doctor] session channel subscribe status:', status, 'for session:', activeSessionId);
        if (status === 'SUBSCRIBED') {
          fetchActiveSession();
        }
      });

    sessionChannelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      sessionChannelRef.current = null;
    };
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Per-upcoming-session cancel listener ──
  // Uses a stable Map ref — only subscribes NEW session IDs, only unsubscribes REMOVED ones.
  // This eliminates the teardown/rebuild window that caused missed SHIFT_CANCELLED broadcasts.
  useEffect(() => {
    const map = upcomingChannelsRef.current;
    const coverageMap = upcomingCoverageChannelsRef.current;
    const currentIds = new Set(upcomingSessions.map((s) => s.id));

    // Unsubscribe channels for sessions no longer in the list
    for (const [id, ch] of map.entries()) {
      if (!currentIds.has(id)) {
        supabase.removeChannel(ch);
        map.delete(id);
      }
    }
    for (const [id, ch] of coverageMap.entries()) {
      if (!currentIds.has(id)) {
        supabase.removeChannel(ch);
        coverageMap.delete(id);
      }
    }

    // Subscribe channels for new sessions not yet in the map
    for (const session of upcomingSessions) {
      if (map.has(session.id)) continue; // already subscribed — do NOT recreate
      const ch = supabase.channel(`upcoming:${session.id}`)
        .on('broadcast', { event: 'SHIFT_CANCELLED' }, () => {
          console.log('[Doctor] upcoming session cancelled (session channel):', session.id);
          supabase.removeChannel(ch);
          map.delete(session.id);
          setUpcomingSessions((prev) => prev.filter((s) => s.id !== session.id));
          setActiveJobCount((prev) => Math.max(0, prev - 1));
          PollingManager.stop(`cancel-upcoming-${session.id}`);
          PollingManager.start(`cancel-confirm-${session.id}`, async () => {
            const { data: s } = await supabase
              .from('coverage_sessions')
              .select('status')
              .eq('id', session.id)
              .maybeSingle();
            if (!s || s.status === 'cancelled') return true;
            return false;
          });
        })
        .subscribe();
      map.set(session.id, ch);

      // ── coverage:{session_id} — third delivery path for STATUS_CHANGED ──
      if (coverageMap.has(session.id)) continue;
      const covCh = supabase.channel(`coverage:${session.id}`)
        .on('broadcast', { event: 'STATUS_CHANGED' }, (payload) => {
          const status = payload?.payload?.status as string | undefined;
          console.log('[Doctor] coverage channel STATUS_CHANGED:', session.id, status);
          if (status === 'cancelled') {
            supabase.removeChannel(covCh);
            coverageMap.delete(session.id);
            setUpcomingSessions((prev) => prev.filter((s) => s.id !== session.id));
            setActiveJobCount((prev) => Math.max(0, prev - 1));
            PollingManager.start(`cancel-confirm-cov-${session.id}`, async () => {
              const { data: s } = await supabase
                .from('coverage_sessions')
                .select('status')
                .eq('id', session.id)
                .maybeSingle();
              if (!s || s.status === 'cancelled') {
                reconcileUpcomingRef.current();
                return true;
              }
              return false;
            });
          } else if (status === 'active') {
            startShiftInProgressRef.current = true;
            supabase.removeChannel(covCh);
            coverageMap.delete(session.id);
            setActiveSession((prev) => {
              if (prev && prev.status === 'active') return prev;
              return { ...session, status: 'active' } as CoverageSession;
            });
            setActiveSessionId(session.id);
            setUpcomingSessions((prev) => prev.filter((s) => s.id !== session.id));
            // Fetch authoritative state from DB and clear the transition guard
            fetchActiveSession().finally(() => {
              startShiftInProgressRef.current = false;
            });
            PollingManager.start(`start-confirm-cov-${session.id}`, async () => {
              const { data: s } = await supabase
                .from('coverage_sessions')
                .select('id, status')
                .eq('id', session.id)
                .maybeSingle();
              if (s?.status === 'active') {
                return true;
              }
              return false;
            });
          } else if (status === 'paused') {
            fetchActiveSession();
            reconcileUpcomingRef.current();
          }
        })
        .subscribe();
      coverageMap.set(session.id, covCh);
    }
  }, [upcomingSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup all upcoming channels on unmount ──
  useEffect(() => {
    const map = upcomingChannelsRef.current;
    const coverageMap = upcomingCoverageChannelsRef.current;
    return () => {
      for (const ch of map.values()) {
        supabase.removeChannel(ch);
      }
      map.clear();
      for (const ch of coverageMap.values()) {
        supabase.removeChannel(ch);
      }
      coverageMap.clear();
    };
  }, []);

  // ── Stable postgres_changes subscription — catches status transitions that broadcast channels miss ──
  // This is the architectural fix for Start Shift: the coverage:{id} broadcast channel can be
  // destroyed by a concurrent upcomingSessions state update (background poll race). This subscription
  // is permanent and cannot be torn down by any state change — it is the guaranteed delivery path.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`session-status-watch:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'coverage_sessions',
          filter: `doctor_id=eq.${user.id}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          // Only act when status actually changed
          if (!newRow?.status || newRow.status === oldRow?.status) return;
          const newStatus = newRow.status as string;
          console.log('[Doctor] postgres_changes session status:', oldRow?.status, '→', newStatus, 'session:', newRow.id);
          if (newStatus === 'active') {
            // This is the Start Shift transition. Call fetchActiveSession() immediately —
            // same as what happens on app restart. This is the guaranteed fallback path.
            fetchActiveSession();
          } else if (newStatus === 'paused') {
            fetchActiveSession();
          } else if (newStatus === 'cancelled') {
            // Reconcile upcoming to remove the cancelled session
            reconcileUpcomingRef.current();
          } else if (newStatus === 'payment_pending') {
            // Fetch active session immediately so the proactive payment poll useEffect can start
            fetchActiveSession();
          }
          // settled, requester_paid are handled by existing payment polling
        }
      )
      .subscribe((status) => {
        console.log('[Doctor] session-status-watch channel:', status);
      });
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stable postgres_changes on coverage_requests — layer 3 for dispatch events ──
  // INSERT: adds pending, non-expired requests to the queue (deduped).
  // UPDATE: removes matched/expired/cancelled requests from the queue.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`coverage-requests-pg:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'coverage_requests',
        },
        (payload) => {
          const row = payload.new as any;
          if (row?.status !== 'pending') return;
          if (row?.expiry_at && new Date(row.expiry_at) <= new Date()) return;
          const req: DispatchRequest = {
            id: row.id,
            requester_id: row.requester_id,
            hospital_name: row.hospital_name,
            hospital_address: row.hospital_address,
            shift_type: row.shift_type,
            shift_date: row.shift_date,
            start_time: row.start_time,
            end_time: row.end_time,
            duration_hours: row.duration_hours ?? 0,
            coverage_length: row.coverage_length,
            environment: row.environment,
            note: row.note,
            price: row.price ?? 0,
            expiry_at: row.expiry_at,
            requester_rating: row.requester_rating,
            requester_reliability: row.requester_reliability,
          };
          console.log('[Doctor] coverage_requests INSERT via postgres_changes — adding to queue:', req.id);
          setRequestQueue((prev) => {
            if (prev.some((r) => r.id === req.id)) return prev;
            return [...prev, req];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'coverage_requests',
          filter: `doctor_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          const evictStatuses = ['matched', 'expired', 'cancelled'];
          if (evictStatuses.includes(row?.status)) {
            console.log('[Doctor] coverage_requests UPDATE via postgres_changes — evicting from queue:', row.id, 'status:', row.status);
            setRequestQueue((prev) => prev.filter((r) => r.id !== row.id));
          }
        }
      )
      .subscribe((status) => {
        console.log('[Doctor] coverage-requests-pg channel:', status);
      });
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── postgres_changes — doctor_profiles: Layer 3 for Ratings ──────────────
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`doctor-profile-pg:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'doctor_profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          console.log('[Doctor] doctor_profiles UPDATE via postgres_changes — rating:', row.rating, 'reliability:', row.reliability);
          if (row.rating !== undefined && row.rating !== null) {
            setDoctorRatingScore(Number(row.rating));
          }
          if (row.reliability !== undefined && row.reliability !== null) {
            setDoctorReliabilityScore(Number(row.reliability));
          }
        }
      )
      .subscribe((status) => {
        console.log('[Doctor] doctor-profile-pg channel:', status);
      });
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Postgres Changes fallback: fires when coverage_sessions row status → requester_paid ──
  useEffect(() => {
    if (!activeSessionId) return;
    const ch = supabase
      .channel(`session-pg-changes:${activeSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'coverage_sessions',
          filter: `id=eq.${activeSessionId}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow?.status === 'requester_paid') {
            console.log('[Doctor] postgres_changes — session status requester_paid, showing rating overlay');
            const sid = newRow.id ?? activeSessionId;
            const hospital = newRow.hospital_name ?? '';
            void (async () => {
              const verifiedAmount = await fetchVerifiedAmount(sid);
              const amt = verifiedAmount || (newRow.total_cost ?? newRow.price ?? 0);
              void maybeShowDoctorRating(sid, hospital, amt);
            })();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Merged doctor-user channel: scores + payment confirmation via user:{user.id} ──
  // The backend broadcasts PAYMENT_CONFIRMED to user:{doctor_id} (not doctor-user:{id}),
  // so we subscribe to user:{user.id} here as a reliable fallback alongside the session channel.
  // Dependency on activeSessionId ensures the handler captures the latest session ID in its closure.
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`doctor:${user.id}`)
      .on('broadcast', { event: 'RATING_UPDATED' }, (payload) => {
        if (payload?.payload?.reviewer_role === 'requester') {
          const newRating = payload?.payload?.new_rating;
          if (newRating !== undefined) {
            setDoctorRatingScore(Number(newRating));
          }
        }
      })
      .on('broadcast', { event: 'RELIABILITY_UPDATED' }, (payload) => {
        const newReliability = payload?.payload?.new_reliability;
        if (newReliability !== undefined) {
          setDoctorReliabilityScore(Number(newReliability));
        }
      })
      .on('broadcast', { event: 'PAYMENT_CONFIRMED' }, (payload) => {
        const sessionId = payload?.payload?.session_id ?? activeSessionIdRef.current;
        const hospitalName = payload?.payload?.hospital_name ?? '';
        const amount = payload?.payload?.amount_naira ?? payload?.payload?.total_naira ?? payload?.payload?.price ?? 0;
        console.log('[Doctor] user channel PAYMENT_CONFIRMED received', { sessionId, hospitalName, amount });
        setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
        void maybeShowDoctorRating(sessionId ?? '', hospitalName, amount);
        startPaymentPollingRef.current(sessionId ?? '', hospitalName, amount);
        invalidate(`doctor-coverage-history-${user.id}`);
        invalidate(`doctor-coverage-upcoming-${user.id}`);
        invalidate('doctor_earnings');
      })
      .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
        const sessionId = payload?.payload?.session_id ?? activeSessionIdRef.current;
        const hospitalName = payload?.payload?.hospital_name ?? '';
        const amount = payload?.payload?.amount_naira ?? payload?.payload?.total_naira ?? payload?.payload?.price ?? 0;
        console.log('[Doctor] user channel payment_confirmed received', { sessionId, hospitalName, amount });
        setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
        void maybeShowDoctorRating(sessionId ?? '', hospitalName, amount);
        startPaymentPollingRef.current(sessionId ?? '', hospitalName, amount);
        invalidate(`doctor-coverage-history-${user.id}`);
        invalidate(`doctor-coverage-upcoming-${user.id}`);
        invalidate('doctor_earnings');
      })
      .on('broadcast', { event: 'SHIFT_STARTED' }, (payload) => {
        console.log('[Doctor] user channel SHIFT_STARTED received');
        startShiftInProgressRef.current = true;
        setActiveSession((prev) => prev ? { ...prev, status: 'active' } : prev);
        fetchActiveSession().finally(() => { startShiftInProgressRef.current = false; });
        PollingManager.start('start-confirm-user', async () => {
          const { data: s } = await supabase
            .from('coverage_sessions')
            .select('id, status')
            .eq('id', activeSessionIdRef.current ?? '')
            .maybeSingle();
          if (s?.status === 'active') return true;
          return false;
        });
      })
      .on('broadcast', { event: 'SHIFT_ENDED' }, (payload) => {
        const updated = payload?.payload?.session as Partial<CoverageSession> | undefined;
        console.log('[Doctor] user channel SHIFT_ENDED received', { sessionId: (updated as any)?.id ?? activeSessionIdRef.current });
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated } as CoverageSession));
        }
        const sid = (updated as any)?.id ?? activeSessionIdRef.current ?? '';
        const hospital = (updated as any)?.hospital_name ?? '';
        const amt = (updated as any)?.total_cost ?? (updated as any)?.price ?? 0;
        startPaymentPollingRef.current(sid, hospital, amt);
      })
      .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
        const sessionId = payload?.payload?.session_id ?? activeSessionIdRef.current;
        console.log('[Doctor] user channel SHIFT_CANCELLED received', { sessionId });
        setActiveSession(null);
        setActiveJobCount((prev) => Math.max(0, prev - 1));
        if (sessionId) {
          setUpcomingSessions((prev) => prev.filter((s) => s.id !== sessionId));
        }
        reconcileUpcomingRef.current();
        PollingManager.start('cancel-confirm-user', async () => {
          if (!sessionId) return true;
          const { data: s } = await supabase
            .from('coverage_sessions')
            .select('status')
            .eq('id', sessionId)
            .maybeSingle();
          if (!s || s.status === 'cancelled') {
            reconcileUpcomingRef.current();
            return true;
          }
          return false;
        });
      })
      .subscribe((status) => {
        // subscription status — no logging needed
      });
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Queue → state sync ──
  useEffect(() => {
    if (requestQueue.length > 0 && doctorScreenState === 'idle' && isOnlineRef.current) {
      setDoctorScreenState('incoming');
    } else if (requestQueue.length === 0 && doctorScreenState === 'incoming') {
      setDoctorScreenState('idle');
    }
  }, [requestQueue, doctorScreenState]); // isOnline removed — use ref for live value

  // ── AppState handler (merged) ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'background') {
        // Record online state and timestamp before going to background
        wasOnlineRef.current = isOnlineRef.current;
        doctorBackgroundedAtRef.current = Date.now();
        console.log('[AppState] background — recording state, staying online');
      }
      if (state === 'active') {
        const elapsed = Date.now() - doctorBackgroundedAtRef.current;
        const FIVE_MINUTES = 5 * 60 * 1000;

        if (doctorBackgroundedAtRef.current > 0 && elapsed > FIVE_MINUTES) {
          console.log('[AppState] active after', Math.round(elapsed / 1000), 's — running doctor background recovery');
          // Channels auto-reconnect via Supabase realtime. Recovery is handled by
          // fetchActiveSession() (session channel SUBSCRIBED) and forceSync() (dispatch poll).

          // 2. Session reconciliation + paid-state recovery
          await fetchActiveSession();
          // Check if session is already in a paid state — fetch directly so we have fresh data
          try {
            const snapRes = await fetchWithAuth(`${EDGE_BASE}/get-active-session?role=doctor`, {});
            if (snapRes.ok) {
              const snapData = await snapRes.json();
              const snap = snapData?.session ?? null;
              if (snap && (snap.status === 'requester_paid' || snap.status === 'settled')) {
                console.log('[Doctor] AppState active — session in paid state:', snap.status, '— triggering rating overlay');
                void maybeShowDoctorRating(snap.id, snap.hospital_name ?? '', snap.total_cost ?? 0);
              }
              // settled is fully terminal — clear activeSessionId to stop the subscription and payment poll
              if (snap && snap.status === 'settled') {
                setActiveSessionId(null);
              }
            }
          } catch {
            // non-fatal
          }

          // Rating recovery — re-fetch own scores in case RATING_UPDATED broadcast was missed
          if (user?.id) {
            try {
              const { data: profileSnap } = await supabase
                .from('doctor_profiles')
                .select('rating, reliability')
                .eq('id', user.id)
                .single();
              if (profileSnap) {
                if (profileSnap.rating !== null && profileSnap.rating !== undefined) {
                  setDoctorRatingScore(Number(profileSnap.rating));
                }
                if (profileSnap.reliability !== null && profileSnap.reliability !== undefined) {
                  setDoctorReliabilityScore(Number(profileSnap.reliability));
                }
              }
            } catch {
              // non-fatal
            }
          }

          // 4. Dispatch reconciliation
          if (user) await forceSync();
        } else {
          // Short foreground — existing behaviour
          console.log('[AppState] active — syncing session');
          if (isOnlineRef.current && user) await forceSync();
          fetchActiveSession();
          // Short foreground rating recovery
          if (user?.id) {
            try {
              const { data: profileSnap } = await supabase
                .from('doctor_profiles')
                .select('rating, reliability')
                .eq('id', user.id)
                .single();
              if (profileSnap) {
                if (profileSnap.rating !== null && profileSnap.rating !== undefined) setDoctorRatingScore(Number(profileSnap.rating));
                if (profileSnap.reliability !== null && profileSnap.reliability !== undefined) setDoctorReliabilityScore(Number(profileSnap.reliability));
              }
            } catch { /* non-fatal */ }
          }
        }
      }
    });
    return () => sub.remove();
  }, [user, profile?.verification_status, forceSync, fetchActiveSession, callEdge, maybeShowDoctorRating, startPaymentPolling]);

  // ── Accept ──
  const handleAccept = useCallback(async () => {
    const req = requestQueue[0];
    if (!req || !user) return;
    setAccepting(true);
    try {
      const res = await fetchWithAuth(`${EDGE_BASE}/accept-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: req.id }),
      });
      if (res.status === 409) {
        const body409 = await res.json().catch(() => ({}));
        if (body409.error === 'CAP_REACHED') {
          Alert.alert('Max Shifts Reached', 'You have been taken offline. Complete a shift to go online again.');
          setIsOnline(false);
          callEdge('go-offline');
        } else if (body409.error === 'SHIFT_CONFLICT') {
          Alert.alert('Shift Conflict', 'You already have a confirmed shift scheduled during these hours.');
        } else {
          Alert.alert('Request Taken', 'Request no longer available.');
        }
        setRequestQueue((prev) => prev.slice(1));
        await forceSync();
        return;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || 'Accept failed');
      }
      setConfirmedRequest(req);
      setDoctorScreenState('idle');
      setRequestQueue([]);

      // Fetch the newly created session
      await fetchActiveSession();

      // Start accept poll to confirm session creation
      const acceptedReqId = req.id;
      console.log('[Doctor] Starting accept poll for request:', acceptedReqId);
      PollingManager.start('accept', async () => {
        const { data: s } = await supabase
          .from('coverage_sessions')
          .select('id, status')
          .eq('request_id', acceptedReqId)
          .maybeSingle();
        if (s?.status === 'upcoming') {
          await fetchActiveSession();
          return true;
        }
        return false;
      });

      // Auto-go-offline after accepting the 3rd shift
      if (activeJobCount + 1 >= 3) {
        callEdge('go-offline');
        setIsOnline(false);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAccepting(false);
    }
  }, [requestQueue, user, forceSync, fetchActiveSession, activeJobCount, callEdge]);

  // ── Decline ──
  const handleDecline = useCallback(async () => {
    const req = requestQueue[0];
    if (!req || !user) return;
    try {
      await callEdge('decline-request', { request_id: req.id });
    } catch {}
    setRequestQueue((prev) => prev.slice(1));
  }, [requestQueue, user, callEdge]);

  // ── Doctor Rating — dismiss ──
  const handleDoctorRatingDone = useCallback(async () => {
    const sid = doctorRatingSessionId;
    // Record this session as dismissed AND rated so the overlay never re-appears for it
    if (sid) {
      await Promise.all([
        markDoctorSessionDismissed(sid),
        markDoctorSessionRated(sid),
      ]);
      // Persist dismissal server-side so it survives app reinstalls / new devices
      if (user?.id) {
        supabase.from('rating_dismissals').insert({
          session_id: sid,
          user_id: user.id,
          reviewer_role: 'doctor',
        }).then(() => {}).catch(() => {});
      }
    }
    console.log('[Doctor] Rating card dismissed', { sessionId: sid });
    setShowDoctorRating(false);
    setDoctorRatingSessionId(null);
    setDoctorRatingStars(0);
    setDoctorRatingComment('');
    setDoctorRatingError('');
    setDoctorRatingAmount(0);
    // Clear activeSession so home screen shows "No coverage yet" after payment flow
    setActiveSession(null);
    setUpcomingSessions([]);
    // Stop the 30s session poll — session is permanently settled
    setActiveSessionId(null);
  }, [doctorRatingSessionId]);

  // ── Doctor Rating — submit review ──
  const handleSubmitDoctorRating = useCallback(async () => {
    if (doctorRatingStars === 0) {
      setDoctorRatingError('Please select a star rating.');
      return;
    }
    console.log('[Doctor] Submitting rating', { sessionId: doctorRatingSessionId, stars: doctorRatingStars });
    setSubmittingDoctorRating(true);
    setDoctorRatingError('');
    try {
      const res = await fetchWithAuth(`${EDGE_BASE}/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: doctorRatingSessionId,
          stars: doctorRatingStars,
          comment: doctorRatingComment.trim() || undefined,
          reviewer_role: 'doctor',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit review');
      console.log('[Doctor] Rating submitted successfully', { sessionId: doctorRatingSessionId });
      if (doctorRatingSessionId) {
        await Promise.all([
          markDoctorSessionRated(doctorRatingSessionId),
          markDoctorSessionDismissed(doctorRatingSessionId),
        ]);
      }
      handleDoctorRatingDone();
    } catch (e: any) {
      console.log('[Doctor] Rating submission failed', { error: e.message });
      setDoctorRatingError(e.message);
    } finally {
      setSubmittingDoctorRating(false);
    }
  }, [doctorRatingSessionId, doctorRatingStars, doctorRatingComment, handleDoctorRatingDone]);

  const currentRequest = requestQueue[0] ?? null;
  const showCard = doctorScreenState === 'incoming' && currentRequest !== null;

  // Fee breakdown
  const feeAmount = currentRequest?.price ?? 0;
  const feeCut = Math.round(feeAmount * 0.15);
  const feeYouReceive = feeAmount - feeCut;
  const feeAmountDisplay = `₦${feeAmount.toLocaleString()}`;
  const feeCutDisplay = `-₦${feeCut.toLocaleString()}`;
  const feeYouReceiveDisplay = `₦${feeYouReceive.toLocaleString()}`;

  const currentEnvironment = currentRequest?.environment ?? '';
  const currentHospitalName = currentRequest?.hospital_name ?? '';
  const currentHospitalAddress = currentRequest?.hospital_address ?? '';
  const currentShiftSummary = currentRequest ? formatShiftSummary(currentRequest) : '';
  const currentNote = currentRequest?.note ?? null;

  const cardPaddingBottom = insets.bottom + 24;

  // 3-job cap: pill is disabled when activeJobCount >= 3
  const isJobCapReached = activeJobCount >= 3;

  const contextValue = useMemo(() => ({
    isOnline,
    setIsOnline,
    goOnline,
    doctorScreenState,
    currentRequest,
    confirmedRequest,
    accepting,
    handleAccept,
    handleDecline,
    activeSession,
    setActiveSession,
    activeJobCount,
    setActiveJobCount,
    isJobCapReached,
    upcomingSessions,
    setUpcomingSessions,
    reconcileUpcomingSessions: reconcileUpcoming,
  }), [isOnline, setIsOnline, goOnline, doctorScreenState, currentRequest, confirmedRequest, accepting, handleAccept, handleDecline, activeSession, setActiveSession, activeJobCount, setActiveJobCount, isJobCapReached, upcomingSessions, setUpcomingSessions, reconcileUpcoming]);

  return (
    <DoctorDispatchContext.Provider value={contextValue}>
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{ headerShown: false, animation: 'none', sceneStyle: { paddingBottom: 0 } }}
          tabBar={(props) => showCard ? null : <DoctorTabBar tabs={TABS} />}
        >
          <Tabs.Screen name="(home)" />
          <Tabs.Screen name="(coverage)" />
          <Tabs.Screen name="(earnings)" />
          <Tabs.Screen name="(account)" />
        </Tabs>

        {/* ── INCOMING REQUEST CARD ── */}
        {showCard && currentRequest && (
          <View style={[styles.card, { paddingBottom: cardPaddingBottom }]}>
            {/* Drag handle */}
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <View style={{ width: 36, height: 4, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
            </View>

            {/* Row 1: badges */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <View style={styles.newRequestBadge}>
                <Text style={styles.newRequestText}>New Request</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.badgeText}>
                  <Text style={{ color: '#F4A261' }}>★</Text>
                  {' '}{currentRequest?.requester_rating != null ? Number(currentRequest.requester_rating).toFixed(1) : '--'}
                </Text>
                <Text style={styles.badgeText}>
                  <Text style={{ color: '#34C759' }}>●</Text>
                  {' '}{currentRequest?.requester_reliability != null ? `${Math.round(Number(currentRequest.requester_reliability))}%` : '--'}
                </Text>
                <View style={styles.envBadge}>
                  <Text style={styles.envText}>{currentEnvironment}</Text>
                </View>
              </View>
            </View>

            {/* Hospital name */}
            <Text style={styles.hospitalName}>{currentHospitalName}</Text>
            {/* Address */}
            <Text style={styles.addressText}>{currentHospitalAddress}</Text>
            {/* Shift details */}
            <ShiftDetails request={currentRequest} note={currentNote} />

            {/* Fee breakdown */}
            <View style={styles.feeCard}>
              <FeeRow label="Amount" value={feeAmountDisplay} />
              <View style={styles.divider} />
              <FeeRow label="FlashLocum fee - 15%" value={feeCutDisplay} valueColor="#FF453A" />
              <View style={styles.divider} />
              <FeeRow label="You receive" value={feeYouReceiveDisplay} valueColor="#34C759" />
            </View>

            {/* Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={handleDecline}
                activeOpacity={0.85}
                style={styles.declineButton}
              >
                <Text style={styles.declineButtonText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAccept}
                disabled={accepting}
                activeOpacity={0.85}
                style={styles.acceptButton}
              >
                {accepting
                  ? <ActivityIndicator size="small" color="#1C1C1E" />
                  : <Text style={styles.acceptButtonText}>Accept</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Doctor Rating Overlay ── */}
        <Modal
          visible={showDoctorRating}
          transparent
          animationType="fade"
          onRequestClose={handleDoctorRatingDone}
        >
          {/* Backdrop */}
          <Pressable
            style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' }}
            onPress={() => { Keyboard.dismiss(); handleDoctorRatingDone(); }}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            pointerEvents="box-none"
          >
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}
              keyboardShouldPersistTaps="handled"
              pointerEvents="box-none"
            >
              <Pressable
                onPress={() => Keyboard.dismiss()}
                style={{ width: '100%', maxWidth: 400 }}
              >
                <View style={{ backgroundColor: '#2C2C2E', borderRadius: 24, padding: 24 }}>
                  {/* Payment confirmation banner */}
                  <View style={{ backgroundColor: '#1A3A2A', borderRadius: 12, padding: 14, marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759', marginRight: 8 }} />
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#34C759', letterSpacing: 0.5 }}>PAYMENT RECEIVED</Text>
                    </View>
                    {doctorRatingAmount > 0 && (
                      <>
                        <Text style={{ fontSize: 28, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 2 }}>
                          {'₦'}{doctorRatingAmount.toLocaleString()}
                        </Text>
                        <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>
                          {'₦'}{Math.round(doctorRatingAmount * 0.85).toLocaleString()} to be remitted to your account by 10PM today.
                        </Text>
                      </>
                    )}
                    {doctorRatingAmount === 0 && (
                      <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>
                        To be remitted to your account by 10PM today.
                      </Text>
                    )}
                  </View>

                  {/* Rating prompt */}
                  <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 4 }}>
                    {`How was your shift with ${doctorRatingHospitalName || 'this hospital'}?`}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 20 }}>
                    Share your feedback and help us improve.
                  </Text>

                  {/* Stars */}
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Pressable
                        key={n}
                        onPress={() => { setDoctorRatingStars(n); setDoctorRatingError(''); }}
                        hitSlop={8}
                      >
                        <Text style={{ fontSize: 36, color: n <= doctorRatingStars ? '#F4A261' : '#48484A' }}>★</Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Comment */}
                  <TextInput
                    value={doctorRatingComment}
                    onChangeText={setDoctorRatingComment}
                    placeholder="Write a comment (optional)..."
                    placeholderTextColor="#636366"
                    multiline
                    style={{
                      backgroundColor: '#1C1C1E',
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 14,
                      color: '#FFFFFF',
                      minHeight: 80,
                      textAlignVertical: 'top',
                      marginBottom: 12,
                    }}
                  />

                  {!!doctorRatingError && (
                    <Text style={{ fontSize: 13, color: '#EF4444', marginBottom: 8 }}>{doctorRatingError}</Text>
                  )}

                  {/* Buttons */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable
                      onPress={handleDoctorRatingDone}
                      style={{ flex: 1, backgroundColor: '#3A3A3C', borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>Dismiss</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleSubmitDoctorRating}
                      disabled={submittingDoctorRating}
                      style={{ flex: 2, backgroundColor: submittingDoctorRating ? '#636366' : '#FFFFFF', borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }}>
                        {submittingDoctorRating ? 'Submitting...' : 'Submit Rating'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </DoctorDispatchContext.Provider>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 4,
    zIndex: 2000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
  },
  newRequestBadge: {
    backgroundColor: '#1A3A2A',
    borderColor: '#34C759',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  newRequestText: {
    fontSize: 13,
    color: '#34C759',
    fontFamily: 'Inter_600SemiBold',
  },
  badgeText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontFamily: 'Inter_400Regular',
  },
  envBadge: {
    backgroundColor: '#F5F5F0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  envText: {
    fontSize: 12,
    color: '#1C1C1E',
    fontFamily: 'Inter_400Regular',
  },
  hospitalName: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    marginTop: 12,
  },
  addressText: {
    fontSize: 13,
    color: '#8E8E93',
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },
  feeCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#3A3A3C',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#1C1C1E',
  },
});

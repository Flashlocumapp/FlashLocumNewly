import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { Stack, Href, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import DoctorTabBar, { DoctorTabItem } from '@/components/DoctorTabBar';
import { DoctorDispatchContext, CoverageSession, registerResetCallback } from '@/contexts/DoctorDispatchContext';
import { getCached, setCached, invalidate } from '@/utils/tabCache';
import PollingManager from '../../utils/pollingManager';


const EDGE_BASE = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1';

// Module-level GPS cache for go-online/heartbeat — written by the location watcher
let _layoutCachedCoords: { lat: number; lng: number } | null = null;

// ─── Persistent deduplication for doctor rating overlay ──────────────────────
const DOCTOR_RATED_SESSIONS_KEY = 'doctor_rated_sessions_v1';
// Layer 1: synchronous in-memory Set — blocks concurrent triggers instantly
const _doctorRatedSessions = new Set<string>();

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

// POLL_INTERVAL: 8s in dev (Expo Go WebSocket unreliable), 30s in production.
// Cost at 30s: 2 req/min per online doctor. At 1,000 concurrent doctors = 2,000 req/min —
// well within Supabase Edge Function limits. Realtime is the primary delivery path (zero cost).
const POLL_INTERVAL = __DEV__ ? 8000 : 30000;

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
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const [isOnline, setIsOnline] = useState(false);
  const [doctorScreenState, setDoctorScreenState] = useState<DoctorScreenState>('idle');
  const [requestQueue, setRequestQueue] = useState<DispatchRequest[]>([]);
  const [confirmedRequest, setConfirmedRequest] = useState<DispatchRequest | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Active session state
  const [activeSession, setActiveSession] = useState<CoverageSession | null>(null);
  const [activeJobCount, setActiveJobCount] = useState(0);
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
  const isOnlineRef = useRef(false);
  const isRealtimeHealthyRef = useRef(false);
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
  const maybeShowDoctorRating = useCallback((sessionId: string, hospitalName: string, amount?: number) => {
    // If overlay is already open, do not reset in-progress input
    if (showDoctorRatingRef.current) return;

    const resolvedSessionId = sessionId || activeSessionIdRef.current || '';
    if (!resolvedSessionId) return;

    // Synchronous dedup — if already rated, skip immediately
    if (_doctorRatedSessions.has(resolvedSessionId)) return;

    // Show the overlay immediately — same pattern as requester side
    setDoctorRatingSessionId(resolvedSessionId);
    setDoctorRatingHospitalName(hospitalName);
    setDoctorRatingStars(0);
    setDoctorRatingComment('');
    setDoctorRatingError('');
    setDoctorRatingAmount(amount ?? 0);
    setShowDoctorRating(true);

    // Background dedup check — if a review already exists in the DB, dismiss silently
    void Promise.resolve(
      supabase
        .from('shift_reviews')
        .select('id')
        .eq('session_id', resolvedSessionId)
        .eq('reviewer_role', 'doctor')
        .maybeSingle()
    ).then(({ data }) => {
      if (data) {
        // Review already submitted — dismiss the overlay and mark as rated
        markDoctorSessionRated(resolvedSessionId);
        setShowDoctorRating(false);
      }
    }).catch(() => {
      // Non-fatal — leave overlay visible
    });
  }, [activeSessionIdRef]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setActiveSession(session);
      setActiveJobCount(jobCount);
      // If session is already paid, use persistent guard to decide whether to show overlay
      if (session && (session.status === 'requester_paid' || session.status === 'settled')) {
        maybeShowDoctorRating(session.id, session.hospital_name ?? '', session.price ?? 0);
      }
    } catch (e: any) {
      // non-fatal
    }
  }, [maybeShowDoctorRating]);

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
      setActiveSessionId(activeSession.id);
    }
    // Intentionally do NOT clear when activeSession becomes null —
    // this keeps the session channel alive after payment_confirmed fires.
  }, [activeSession?.id]);

  // On mount — restore session state after app restart
  useEffect(() => {
    if (!user) return;
    warmDoctorRatedCache();
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
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register reset callback so AuthContext can clear dispatch state on sign-out
  useEffect(() => {
    registerResetCallback(() => {
      console.log('[DoctorLayout] reset — clearing active session and job count');
      setActiveSession(null);
      setActiveSessionId(null); // clear stale ID so ghost subscriptions don't form on next login
      setActiveJobCount(0);
      setIsOnline(false);
      setDoctorScreenState('idle');
      setRequestQueue([]);
      setConfirmedRequest(null);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cleanup PollingManager on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => { PollingManager.stopAll(); };
  }, []);

  // Re-fetch active session on SIGNED_IN (handles login after logout)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        console.log('[DoctorLayout] SIGNED_IN — re-fetching active session');
        fetchActiveSession();
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchActiveSession]);



  // ── Go-online / Go-offline — only fires when isOnline actually changes ──
  useEffect(() => {
    if (!user) return;
    if (prevIsOnlineRef.current === isOnline) return;
    prevIsOnlineRef.current = isOnline;
    const toggle = async () => {
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
                let body = '';
                try { body = await res?.text() ?? ''; } catch (_) {}
                Alert.alert(
                  'Could not go online',
                  `Error ${res?.status ?? 'unknown'}: ${body || 'No response from server'}`,
                  [{ text: 'OK' }]
                );
              }
            } else {
              let body = '';
              try { body = await res?.text() ?? ''; } catch (_) {}
              Alert.alert(
                'Could not go online',
                `Error ${res?.status ?? 'unknown'}: ${body || 'No response from server'}`,
                [{ text: 'OK' }]
              );
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
        // non-fatal
      }
    };
    toggle();
  }, [isOnline, user]);

  // ── Heartbeat every 60s while online ──
  useEffect(() => {
    if (!isOnline || !user) return;
    const send = async () => {
      await callEdge('heartbeat', {});
    };
    send();
    const id = setInterval(send, 60000);
    return () => clearInterval(id);
  }, [isOnline, user, callEdge]);

  // ── Polling fallback — dispatch poll (online only) ──
  useEffect(() => {
    if (!isOnline || !user) return;
    const id = setInterval(() => {
      if (__DEV__ || !isRealtimeHealthyRef.current) {
        forceSyncRef.current();
      }
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
  }, [activeSessionId, user, fetchActiveSession]);

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
        const evictedId: string = payload.payload?.request_id;
        setRequestQueue((prev) => prev.filter((r) => r.id !== evictedId));
      })
      .subscribe((status) => {
        isRealtimeHealthyRef.current = status === 'SUBSCRIBED';
        if (status === 'SUBSCRIBED' && isOnlineRef.current) {
          forceSync();
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
      .on('broadcast', { event: 'SHIFT_STARTED' }, (payload) => {
        PollingManager.stop('accept');
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated, status: 'active' } as CoverageSession));
        }
        // Always re-fetch to confirm — optimistic update fires first, re-fetch corrects within ~300ms
        fetchActiveSession();
      })
      .on('broadcast', { event: 'SHIFT_PAUSED' }, (payload) => {
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated } as CoverageSession));
        }
        // Always re-fetch to confirm — optimistic update fires first, re-fetch corrects within ~300ms
        fetchActiveSession();
      })
      .on('broadcast', { event: 'SHIFT_RESUMED' }, (payload) => {
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated, status: 'active' } as CoverageSession));
        }
        // Always re-fetch to confirm — optimistic update fires first, re-fetch corrects within ~300ms
        fetchActiveSession();
      })
      .on('broadcast', { event: 'SHIFT_ENDED' }, (payload) => {
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated } as CoverageSession));
        }
      })
      .on('broadcast', { event: 'PAYMENT_CONFIRMED' }, (payload) => {
        const sessionId = payload?.payload?.session_id ?? activeSessionIdRef.current ?? activeSessionId;
        const hospitalName = payload?.payload?.hospital_name ?? '';
        const amount = payload?.payload?.amount_naira ?? payload?.payload?.total_naira ?? payload?.payload?.price ?? 0;
        console.log('[Doctor] PAYMENT_CONFIRMED broadcast received', { sessionId, hospitalName, amount });
        setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
        maybeShowDoctorRating(sessionId ?? '', hospitalName, amount);
        invalidate('coverage_doctor_completed');
        invalidate('coverage_doctor_upcoming');
      })
      .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
        const sessionId = payload?.payload?.session_id ?? activeSessionIdRef.current ?? activeSessionId;
        const hospitalName = payload?.payload?.hospital_name ?? '';
        const amount = payload?.payload?.amount_naira ?? payload?.payload?.total_naira ?? payload?.payload?.price ?? 0;
        console.log('[Doctor] payment_confirmed broadcast received', { sessionId, hospitalName, amount });
        setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
        maybeShowDoctorRating(sessionId ?? '', hospitalName, amount);
        invalidate('coverage_doctor_completed');
        invalidate('coverage_doctor_upcoming');
      })
      .on('broadcast', { event: 'PAYMENT_COMPLETE' }, (payload) => {
        setActiveSession((prev) => prev ? { ...prev, status: 'payment_complete' } : prev);
      })
      .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
        PollingManager.stop('cancel');
        setActiveSession(null);
        setActiveJobCount((prev) => Math.max(0, prev - 1));
      })
      .subscribe((status) => {
        // subscription status — no logging needed
      });

    sessionChannelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      sessionChannelRef.current = null;
    };
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Merged doctor-user channel: scores + payment confirmation via user:{user.id} ──
  // The backend broadcasts PAYMENT_CONFIRMED to user:{doctor_id} (not doctor-user:{id}),
  // so we subscribe to user:{user.id} here as a reliable fallback alongside the session channel.
  // Dependency on activeSessionId ensures the handler captures the latest session ID in its closure.
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`user:${user.id}`)
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
        maybeShowDoctorRating(sessionId ?? '', hospitalName, amount);
        invalidate('coverage_doctor_completed');
        invalidate('coverage_doctor_upcoming');
      })
      .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
        const sessionId = payload?.payload?.session_id ?? activeSessionIdRef.current;
        const hospitalName = payload?.payload?.hospital_name ?? '';
        const amount = payload?.payload?.amount_naira ?? payload?.payload?.total_naira ?? payload?.payload?.price ?? 0;
        console.log('[Doctor] user channel payment_confirmed received', { sessionId, hospitalName, amount });
        setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
        maybeShowDoctorRating(sessionId ?? '', hospitalName, amount);
        invalidate('coverage_doctor_completed');
        invalidate('coverage_doctor_upcoming');
      })
      .subscribe((status) => {
        // subscription status — no logging needed
      });
    return () => { supabase.removeChannel(ch); };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

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

          // 1. Channel health check — dispatch channel
          if (channelRef.current && channelRef.current.state !== 'joined') {
            console.log('[AppState] dispatch channel unhealthy (state:', channelRef.current.state, ') — re-subscribing');
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
            const newChannel = supabase.channel('dispatch:lagos')
              .on('broadcast', { event: 'NEW_REQUEST' }, (payload) => {
                const req = payload.payload as DispatchRequest;
                const now = new Date();
                if (req.expiry_at && new Date(req.expiry_at) <= now) return;
                setRequestQueue((prev) => {
                  if (prev.some((r) => r.id === req.id)) return prev;
                  return [...prev, req];
                });
              })
              .on('broadcast', { event: 'EVICT_REQUEST' }, (payload) => {
                const evictedId: string = payload.payload?.request_id;
                setRequestQueue((prev) => prev.filter((r) => r.id !== evictedId));
              })
              .subscribe((status) => {
                isRealtimeHealthyRef.current = status === 'SUBSCRIBED';
                if (status === 'SUBSCRIBED' && isOnlineRef.current) {
                  forceSyncRef.current();
                }
              });
            channelRef.current = newChannel;
          }

          // Session channel health check
          if (activeSessionIdRef.current && sessionChannelRef.current && sessionChannelRef.current.state !== 'joined') {
            console.log('[AppState] session channel unhealthy (state:', sessionChannelRef.current.state, ') — re-subscribing');
            supabase.removeChannel(sessionChannelRef.current);
            sessionChannelRef.current = null;
            const sid = activeSessionIdRef.current;
            const newSessionChannel = supabase.channel(`session:${sid}`)
              .on('broadcast', { event: 'SHIFT_STARTED' }, () => { fetchActiveSession(); })
              .on('broadcast', { event: 'SHIFT_PAUSED' }, () => { fetchActiveSession(); })
              .on('broadcast', { event: 'SHIFT_RESUMED' }, () => { fetchActiveSession(); })
              .on('broadcast', { event: 'SHIFT_ENDED' }, () => { fetchActiveSession(); })
              .on('broadcast', { event: 'PAYMENT_CONFIRMED' }, (payload) => {
                const sessionId = payload?.payload?.session_id ?? activeSessionIdRef.current ?? sid;
                const hospitalName = payload?.payload?.hospital_name ?? '';
                const amount = payload?.payload?.amount_naira ?? payload?.payload?.total_naira ?? payload?.payload?.price ?? 0;
                setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
                maybeShowDoctorRating(sessionId ?? '', hospitalName, amount);
              })
              .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
                const sessionId = payload?.payload?.session_id ?? activeSessionIdRef.current ?? sid;
                const hospitalName = payload?.payload?.hospital_name ?? '';
                const amount = payload?.payload?.amount_naira ?? payload?.payload?.total_naira ?? payload?.payload?.price ?? 0;
                setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
                maybeShowDoctorRating(sessionId ?? '', hospitalName, amount);
              })
              .subscribe(() => {});
            sessionChannelRef.current = newSessionChannel;
          }

          // 2. Session reconciliation
          await fetchActiveSession();

          // 3. Presence re-establishment — only if doctor was online and is verified
          if (wasOnlineRef.current && profile?.verification_status === 'verified') {
            console.log('[AppState] re-establishing presence via heartbeat');
            callEdge('heartbeat', {}).catch(() => {});
          }

          // 4. Dispatch reconciliation
          if (user) await forceSync();
        } else {
          // Short foreground — existing behaviour
          console.log('[AppState] active — syncing session');
          if (isOnlineRef.current && user) await forceSync();
          fetchActiveSession();
        }
      }
    });
    return () => sub.remove();
  }, [user, profile?.verification_status, forceSync, fetchActiveSession, callEdge, maybeShowDoctorRating]);

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
  const handleDoctorRatingDone = useCallback(() => {
    const sid = doctorRatingSessionId;
    // Do NOT call markDoctorSessionRated here — only successful submission marks as rated.
    // Dismissing without submitting should allow the overlay to re-appear on next poll.
    console.log('[Doctor] Rating card dismissed', { sessionId: sid });
    setShowDoctorRating(false);
    setDoctorRatingSessionId(null);
    setDoctorRatingStars(0);
    setDoctorRatingComment('');
    setDoctorRatingError('');
    setDoctorRatingAmount(0);
    // Clear activeSession so home screen shows "No coverage yet" after payment flow
    setActiveSession(null);
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
      if (doctorRatingSessionId) markDoctorSessionRated(doctorRatingSessionId);
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

  return (
    <DoctorDispatchContext.Provider value={{
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
    }}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
          <Stack.Screen name="(home)" />
          <Stack.Screen name="(coverage)" />
          <Stack.Screen name="(earnings)" />
          <Stack.Screen name="(account)" />
        </Stack>

        {/* Tab bar — hidden when a request card is showing */}
        {!showCard && <DoctorTabBar tabs={TABS} />}

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
          <View style={{ flex: 1 }}>
            {/* Backdrop — full screen, tap to dismiss overlay */}
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => { Keyboard.dismiss(); handleDoctorRatingDone(); }}
            >
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} />
            </Pressable>

            {/* Card — centred, tap inside to dismiss keyboard only */}
            <View
              pointerEvents="box-none"
              style={{ ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', padding: 24 }}
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
                      <Text style={{ fontSize: 28, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 2 }}>
                        {'₦'}{doctorRatingAmount.toLocaleString()}
                      </Text>
                    )}
                    <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>
                      To be remitted to your account by 10PM today.
                    </Text>
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
            </View>
          </View>
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

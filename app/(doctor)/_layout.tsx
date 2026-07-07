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
  TouchableWithoutFeedback,
} from 'react-native';
import { Stack, Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { supabase, getValidToken } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import DoctorTabBar, { DoctorTabItem } from '@/components/DoctorTabBar';
import { DoctorDispatchContext, CoverageSession } from '@/contexts/DoctorDispatchContext';

const EDGE_BASE = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1';

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
  const sep = ' ● ';
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
        <Text style={{ color: '#FFFFFF', fontSize: 13 }}> ● </Text>
        <Text style={{ color: '#8E8E93', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
          {startDay}
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 13 }}> ● </Text>
        <Text style={{ color: '#8E8E93', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
          {startFormatted} – {endFormatted}
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 13 }}> ● </Text>
        <Text style={{ color: '#8E8E93', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
          {hoursLabel}
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 13 }}> ● </Text>
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
  const { user } = useAuth();
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

  // Doctor rating overlay state
  const [showDoctorRating, setShowDoctorRating] = useState(false);
  const [doctorRatingSessionId, setDoctorRatingSessionId] = useState<string | null>(null);
  const [doctorRatingHospitalName, setDoctorRatingHospitalName] = useState<string>('');
  const [doctorRatingStars, setDoctorRatingStars] = useState(0);
  const [doctorRatingComment, setDoctorRatingComment] = useState('');
  const [submittingDoctorRating, setSubmittingDoctorRating] = useState(false);
  const [doctorRatingError, setDoctorRatingError] = useState('');

  const hasShownRatingRef = useRef(false);
  const prevIsOnlineRef = useRef<boolean | undefined>(undefined);
  const callEdgeRef = useRef<(fn: string, body?: object) => Promise<Response | null>>(async () => null);
  const forceSyncRef = useRef<() => Promise<void>>(async () => {});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const doctorChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isOnlineRef = useRef(false);
  const isRealtimeHealthyRef = useRef(false);

  const callEdge = useCallback(async (fn: string, body?: object) => {
    const token = await getValidToken();
    if (!token) return null;
    console.log(`[DoctorLayout] Calling edge function: ${fn}`, body ?? '');
    const res = await fetch(`${EDGE_BASE}/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    console.log(`[DoctorLayout] ${fn} response status:`, res.status);
    return res;
  }, []);

  const forceSync = useCallback(async () => {
    if (!user) return;
    console.log('[DoctorLayout] Force-syncing...');
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
      console.log('[DoctorLayout] Force-sync result — requests:', data.requests?.length ?? 0, 'fresh:', freshRequests.length);
      if (freshRequests.length > 0) {
        setRequestQueue(freshRequests);
        setDoctorScreenState('incoming');
      } else {
        setRequestQueue([]);
        setDoctorScreenState((prev) => prev === 'incoming' ? 'idle' : prev);
      }
    } catch (e: any) {
      console.log('[DoctorLayout] Force-sync error:', e.message);
    }
  }, [user, callEdge]);

  // Fetch active session from edge function
  const fetchActiveSession = useCallback(async () => {
    const token = await getValidToken();
    if (!token) return;
    console.log('[DoctorLayout] Fetching active session for doctor');
    try {
      const res = await fetch(`${EDGE_BASE}/get-active-session?role=doctor`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('[DoctorLayout] get-active-session response status:', res.status);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.log('[DoctorLayout] get-active-session error:', errText);
        return;
      }
      const data = await res.json();
      const session: CoverageSession | null = data?.session ?? null;
      const jobCount: number = data?.active_job_count ?? 0;
      console.log('[DoctorLayout] Active session fetched:', session?.id ?? 'none', 'job count:', jobCount);
      setActiveSession(session);
      setActiveJobCount(jobCount);
      // If session is already paid and rating overlay not yet shown, trigger it
      // (handles app-was-backgrounded case)
      if (
        session &&
        (session.status === 'requester_paid' || session.status === 'settled') &&
        !hasShownRatingRef.current
      ) {
        console.log('[DoctorLayout] fetchActiveSession: session already paid, showing rating overlay for:', session.id);
        hasShownRatingRef.current = true;
        setDoctorRatingSessionId(session.id);
        setDoctorRatingHospitalName(session.hospital_name ?? '');
        setDoctorRatingStars(0);
        setDoctorRatingComment('');
        setDoctorRatingError('');
        setShowDoctorRating(true);
      }
    } catch (e: any) {
      console.log('[DoctorLayout] fetchActiveSession error:', e.message);
    }
  }, []);

  // Keep stable refs
  useEffect(() => { callEdgeRef.current = callEdge; }, [callEdge]);
  useEffect(() => { forceSyncRef.current = forceSync; }, [forceSync]);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  // On mount — restore session state after app restart
  useEffect(() => {
    if (!user) return;
    fetchActiveSession();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Go-online / Go-offline — only fires when isOnline actually changes ──
  useEffect(() => {
    if (!user) return;
    if (prevIsOnlineRef.current === isOnline) return;
    prevIsOnlineRef.current = isOnline;
    const toggle = async () => {
      const fn = isOnline ? 'go-online' : 'go-offline';
      console.log('[DoctorLayout] Toggling status:', fn);
      try {
        const res = await callEdgeRef.current(fn);
        if (isOnline) {
          if (!res || !res.ok) {
            let body = '';
            try { body = await res?.text() ?? ''; } catch (_) {}
            console.log('[DoctorLayout] go-online failed — status:', res?.status, 'body:', body);
            Alert.alert(
              'Could not go online',
              `Error ${res?.status ?? 'unknown'}: ${body || 'No response from server'}`,
              [{ text: 'OK' }]
            );
          } else {
            console.log('[DoctorLayout] Went online — force-syncing queue');
            await forceSyncRef.current();
            // Explicitly trigger the card if the sync found requests.
            // Don't rely on the async React re-render cycle — read the ref directly.
            setRequestQueue((current) => {
              if (current.length > 0) {
                console.log('[DoctorLayout] go-online: queue has items after sync, setting incoming');
                setDoctorScreenState('incoming');
              }
              return current; // no change to queue itself
            });
          }
        } else {
          console.log('[DoctorLayout] Went offline — clearing queue');
          setRequestQueue([]);
          setDoctorScreenState('idle');
        }
      } catch (e: any) {
        console.log('[DoctorLayout] Toggle error:', e.message);
      }
    };
    toggle();
  }, [isOnline, user]);

  // ── Heartbeat every 60s while online ──
  useEffect(() => {
    if (!isOnline || !user) return;
    const send = async () => {
      console.log('[DoctorLayout] Sending heartbeat');
      await callEdge('heartbeat');
    };
    send();
    const id = setInterval(send, 60000);
    return () => clearInterval(id);
  }, [isOnline, user, callEdge]);

  // ── Polling fallback ──
  useEffect(() => {
    if (!isOnline || !user) return;
    const id = setInterval(() => {
      // Always sync — Realtime health only affects logging, not whether we sync.
      if (!isRealtimeHealthyRef.current) {
        console.log('[DoctorLayout] Poll tick — Realtime unhealthy, force-syncing');
      } else {
        console.log('[DoctorLayout] Poll tick — Realtime healthy, syncing anyway as safety net');
      }
      forceSyncRef.current();
      // Also re-fetch active session on every tick as a safety net
      fetchActiveSession();
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [isOnline, user, fetchActiveSession]);

  // ── Realtime subscription — dispatch channel ──
  useEffect(() => {
    if (!user) return;
    console.log('[DoctorLayout] Subscribing to dispatch:lagos channel');
    const channel = supabase.channel('dispatch:lagos')
      .on('broadcast', { event: 'NEW_REQUEST' }, (payload) => {
        const req = payload.payload as DispatchRequest;
        const now = new Date();
        if (req.expiry_at && new Date(req.expiry_at) <= now) {
          console.log('[DoctorLayout] NEW_REQUEST already expired, ignoring:', req.id);
          return;
        }
        console.log('[DoctorLayout] NEW_REQUEST received:', req.id, '— adding to queue unconditionally');
        setRequestQueue((prev) => {
          if (prev.some((r) => r.id === req.id)) return prev;
          return [...prev, req];
        });
        // Do NOT check isOnlineRef here — it can be stale.
        // The Queue → state sync effect will transition to 'incoming' when isOnline is true.
      })
      .on('broadcast', { event: 'EVICT_REQUEST' }, (payload) => {
        const evictedId: string = payload.payload?.request_id;
        console.log('[DoctorLayout] EVICT_REQUEST received:', evictedId);
        setRequestQueue((prev) => prev.filter((r) => r.id !== evictedId));
      })
      .subscribe((status) => {
        console.log('[DoctorLayout] dispatch:lagos subscription status:', status);
        isRealtimeHealthyRef.current = status === 'SUBSCRIBED';
        if (status === 'SUBSCRIBED' && isOnlineRef.current) {
          forceSync();
        }
      });
    channelRef.current = channel;
    return () => {
      console.log('[DoctorLayout] Unsubscribing from dispatch:lagos');
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user]); // intentionally omit isOnline/forceSync

  // ── Realtime subscription — session channel (when activeSession changes) ──
  useEffect(() => {
    if (!activeSession) {
      if (sessionChannelRef.current) {
        console.log('[DoctorLayout] No active session — removing session channel');
        supabase.removeChannel(sessionChannelRef.current);
        sessionChannelRef.current = null;
      }
      return;
    }

    const channelName = `session:${activeSession.id}`;
    console.log('[DoctorLayout] Subscribing to session channel:', channelName);

    // Remove old channel if any
    if (sessionChannelRef.current) {
      supabase.removeChannel(sessionChannelRef.current);
      sessionChannelRef.current = null;
    }

    const ch = supabase.channel(channelName)
      .on('broadcast', { event: 'SHIFT_STARTED' }, (payload) => {
        console.log('[DoctorLayout] SHIFT_STARTED received:', payload);
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated, status: 'active' } as CoverageSession));
        }
        // Always re-fetch to confirm — optimistic update fires first, re-fetch corrects within ~300ms
        fetchActiveSession();
      })
      .on('broadcast', { event: 'SHIFT_PAUSED' }, (payload) => {
        console.log('[DoctorLayout] SHIFT_PAUSED received:', payload);
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated } as CoverageSession));
        }
        // Always re-fetch to confirm — optimistic update fires first, re-fetch corrects within ~300ms
        fetchActiveSession();
      })
      .on('broadcast', { event: 'SHIFT_RESUMED' }, (payload) => {
        console.log('[DoctorLayout] SHIFT_RESUMED received:', payload);
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated, status: 'active' } as CoverageSession));
        }
        // Always re-fetch to confirm — optimistic update fires first, re-fetch corrects within ~300ms
        fetchActiveSession();
      })
      .on('broadcast', { event: 'SHIFT_ENDED' }, (payload) => {
        console.log('[DoctorLayout] SHIFT_ENDED received:', payload);
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated } as CoverageSession));
        }
      })
      .on('broadcast', { event: 'PAYMENT_CONFIRMED' }, (payload) => {
        console.log('[DoctorLayout] PAYMENT_CONFIRMED received (session channel):', payload);
        const sessionId = payload?.payload?.session_id ?? activeSession?.id;
        const hospitalName = payload?.payload?.hospital_name ?? activeSession?.hospital_name ?? '';
        setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
        if (sessionId) {
          console.log('[DoctorLayout] Opening doctor rating overlay for session:', sessionId);
          setDoctorRatingSessionId(sessionId);
          setDoctorRatingHospitalName(hospitalName);
          setDoctorRatingStars(0);
          setDoctorRatingComment('');
          setDoctorRatingError('');
          setShowDoctorRating(true);
          // Refresh session state to get latest data (hospital_name etc.)
          fetchActiveSession();
        }
      })
      .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
        console.log('[DoctorLayout] payment_confirmed received (session channel):', payload);
        const sessionId = payload?.payload?.session_id ?? activeSession?.id;
        const hospitalName = payload?.payload?.hospital_name ?? activeSession?.hospital_name ?? '';
        setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
        if (sessionId) {
          console.log('[DoctorLayout] Opening doctor rating overlay for session:', sessionId);
          setDoctorRatingSessionId(sessionId);
          setDoctorRatingHospitalName(hospitalName);
          setDoctorRatingStars(0);
          setDoctorRatingComment('');
          setDoctorRatingError('');
          setShowDoctorRating(true);
          // Refresh session state to get latest data (hospital_name etc.)
          fetchActiveSession();
        }
      })
      .on('broadcast', { event: 'PAYMENT_COMPLETE' }, (payload) => {
        console.log('[DoctorLayout] PAYMENT_COMPLETE received:', payload);
        setActiveSession((prev) => prev ? { ...prev, status: 'payment_complete' } : prev);
      })
      .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
        console.log('[DoctorLayout] SHIFT_CANCELLED received (session channel):', payload);
        setActiveSession(null);
        setActiveJobCount((prev) => Math.max(0, prev - 1));
      })
      .subscribe((status) => {
        console.log('[DoctorLayout] Session channel status:', channelName, status);
      });

    sessionChannelRef.current = ch;

    return () => {
      console.log('[DoctorLayout] Unsubscribing from session channel:', channelName);
      supabase.removeChannel(ch);
      sessionChannelRef.current = null;
    };
  }, [activeSession?.id]); // only re-subscribe when session ID changes

  // ── Personal doctor channel (fallback for race condition on session channel) ──
  useEffect(() => {
    if (!user) return;
    const channelName = `doctor:${user.id}`;
    console.log('[DoctorLayout] Subscribing to personal doctor channel:', channelName);

    if (doctorChannelRef.current) {
      supabase.removeChannel(doctorChannelRef.current);
      doctorChannelRef.current = null;
    }

    const ch = supabase.channel(channelName)
      .on('broadcast', { event: 'SHIFT_STARTED' }, (payload) => {
        console.log('[DoctorLayout] SHIFT_STARTED (doctor channel):', payload);
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated, status: 'active' } as CoverageSession));
        }
        // Always re-fetch to confirm — optimistic update fires first, re-fetch corrects within ~300ms
        fetchActiveSession();
      })
      .on('broadcast', { event: 'SHIFT_PAUSED' }, (payload) => {
        console.log('[DoctorLayout] SHIFT_PAUSED (doctor channel):', payload);
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated } as CoverageSession));
        }
        // Always re-fetch to confirm — optimistic update fires first, re-fetch corrects within ~300ms
        fetchActiveSession();
      })
      .on('broadcast', { event: 'SHIFT_RESUMED' }, (payload) => {
        console.log('[DoctorLayout] SHIFT_RESUMED (doctor channel):', payload);
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) {
          setActiveSession((prev) => ({ ...(prev ?? {}), ...updated, status: 'active' } as CoverageSession));
        }
        // Always re-fetch to confirm — optimistic update fires first, re-fetch corrects within ~300ms
        fetchActiveSession();
      })
      .on('broadcast', { event: 'SHIFT_ENDED' }, (payload) => {
        console.log('[DoctorLayout] SHIFT_ENDED (doctor channel):', payload);
        const updated = payload?.payload?.session as CoverageSession | undefined;
        if (updated) setActiveSession((prev) => ({ ...(prev ?? {}), ...updated } as CoverageSession));
      })
      .on('broadcast', { event: 'PAYMENT_CONFIRMED' }, (payload) => {
        console.log('[DoctorLayout] PAYMENT_CONFIRMED (doctor channel):', payload);
        const sessionId = payload?.payload?.session_id ?? activeSession?.id;
        const hospitalName = payload?.payload?.hospital_name ?? activeSession?.hospital_name ?? '';
        setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
        if (sessionId) {
          console.log('[DoctorLayout] Opening doctor rating overlay (doctor channel) for session:', sessionId);
          setDoctorRatingSessionId(sessionId);
          setDoctorRatingHospitalName(hospitalName);
          setDoctorRatingStars(0);
          setDoctorRatingComment('');
          setDoctorRatingError('');
          setShowDoctorRating(true);
          // Refresh session state to get latest data (hospital_name etc.)
          fetchActiveSession();
        }
      })
      .on('broadcast', { event: 'payment_confirmed' }, (payload) => {
        console.log('[DoctorLayout] payment_confirmed (doctor channel):', payload);
        const sessionId = payload?.payload?.session_id ?? activeSession?.id;
        const hospitalName = payload?.payload?.hospital_name ?? activeSession?.hospital_name ?? '';
        setActiveSession((prev) => prev ? { ...prev, status: 'settled' } : prev);
        if (sessionId) {
          console.log('[DoctorLayout] Opening doctor rating overlay (doctor channel) for session:', sessionId);
          setDoctorRatingSessionId(sessionId);
          setDoctorRatingHospitalName(hospitalName);
          setDoctorRatingStars(0);
          setDoctorRatingComment('');
          setDoctorRatingError('');
          setShowDoctorRating(true);
          // Refresh session state to get latest data (hospital_name etc.)
          fetchActiveSession();
        }
      })
      .on('broadcast', { event: 'PAYMENT_COMPLETE' }, () => {
        console.log('[DoctorLayout] PAYMENT_COMPLETE (doctor channel)');
        setActiveSession((prev) => prev ? { ...prev, status: 'payment_complete' } : prev);
      })
      .on('broadcast', { event: 'SHIFT_CANCELLED' }, (payload) => {
        console.log('[DoctorLayout] SHIFT_CANCELLED received (doctor channel):', payload);
        setActiveSession(null);
        setActiveJobCount((prev) => Math.max(0, prev - 1));
      })
      .subscribe((status) => {
        console.log('[DoctorLayout] Doctor channel status:', channelName, status);
      });

    doctorChannelRef.current = ch;

    return () => {
      console.log('[DoctorLayout] Unsubscribing from doctor channel:', channelName);
      supabase.removeChannel(ch);
      doctorChannelRef.current = null;
    };
  }, [user]); // subscribe once when user is available

  // ── Queue → state sync ──
  useEffect(() => {
    if (requestQueue.length > 0 && doctorScreenState === 'idle' && isOnlineRef.current) {
      console.log('[DoctorLayout] Queue has items, transitioning to incoming');
      setDoctorScreenState('incoming');
    } else if (requestQueue.length === 0 && doctorScreenState === 'incoming') {
      console.log('[DoctorLayout] Queue empty, transitioning to idle');
      setDoctorScreenState('idle');
    }
  }, [requestQueue, doctorScreenState]); // isOnline removed — use ref for live value

  // ── AppState force-sync ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && isOnline && user) {
        console.log('[DoctorLayout] App foregrounded — force-syncing');
        await forceSync();
      }
    });
    return () => sub.remove();
  }, [isOnline, user, forceSync]);

  // ── AppState session re-fetch ──
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[DoctorLayout] App foregrounded — re-fetching active session');
        fetchActiveSession();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [fetchActiveSession]);

  // ── Accept ──
  const handleAccept = useCallback(async () => {
    const req = requestQueue[0];
    if (!req || !user) return;
    console.log('[DoctorLayout] Accept button pressed for request:', req.id);
    setAccepting(true);
    try {
      const token = await getValidToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${EDGE_BASE}/accept-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ request_id: req.id }),
      });
      console.log('[DoctorLayout] accept-request response status:', res.status);
      if (res.status === 409) {
        console.log('[DoctorLayout] Race condition — request already taken');
        Alert.alert('Request Taken', 'Request no longer available.');
        setRequestQueue((prev) => prev.slice(1));
        await forceSync();
        return;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || 'Accept failed');
      }
      console.log('[DoctorLayout] Request accepted successfully — transitioning to idle');
      setConfirmedRequest(req);
      setDoctorScreenState('idle');
      setRequestQueue([]);

      // Fetch the newly created session
      console.log('[DoctorLayout] Fetching active session after accept');
      await fetchActiveSession();
    } catch (e: any) {
      console.log('[DoctorLayout] Accept error:', e.message);
      Alert.alert('Error', e.message);
    } finally {
      setAccepting(false);
    }
  }, [requestQueue, user, forceSync, fetchActiveSession]);

  // ── Decline ──
  const handleDecline = useCallback(async () => {
    const req = requestQueue[0];
    if (!req || !user) return;
    console.log('[DoctorLayout] Decline button pressed for request:', req.id);
    try {
      await callEdge('decline-request', { request_id: req.id });
    } catch {}
    setRequestQueue((prev) => prev.slice(1));
  }, [requestQueue, user, callEdge]);

  // ── Doctor Rating — dismiss and navigate to summary ──
  const handleDoctorRatingDone = useCallback(() => {
    console.log('[DoctorLayout] Doctor rating overlay dismissed, navigating to payment-summary');
    const sid = doctorRatingSessionId;
    hasShownRatingRef.current = false;
    setShowDoctorRating(false);
    setDoctorRatingSessionId(null);
    if (sid) {
      router.push(`/(doctor)/(home)/payment-summary?session_id=${sid}`);
    }
  }, [doctorRatingSessionId, router]);

  // ── Doctor Rating — submit review ──
  const handleSubmitDoctorRating = useCallback(async () => {
    console.log('[DoctorLayout] Submit rating button pressed — stars:', doctorRatingStars);
    if (doctorRatingStars === 0) {
      setDoctorRatingError('Please select a star rating.');
      return;
    }
    setSubmittingDoctorRating(true);
    setDoctorRatingError('');
    try {
      const token = await getValidToken();
      console.log('[DoctorLayout] Submitting review to edge function — session:', doctorRatingSessionId, 'stars:', doctorRatingStars);
      const res = await fetch(`${EDGE_BASE}/submit-review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: doctorRatingSessionId,
          stars: doctorRatingStars,
          comment: doctorRatingComment.trim() || undefined,
        }),
      });
      console.log('[DoctorLayout] submit-review response status:', res.status);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit review');
      console.log('[DoctorLayout] Review submitted successfully');
      handleDoctorRatingDone();
    } catch (e: any) {
      console.log('[DoctorLayout] submit-review error:', e.message);
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
    }}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
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
                  {' '}5.0
                </Text>
                <Text style={styles.badgeText}>
                  <Text style={{ color: '#34C759' }}>●</Text>
                  {' '}100%
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
          <TouchableWithoutFeedback onPress={handleDoctorRatingDone}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={{ backgroundColor: '#2C2C2E', borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 }}>
                  <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold', marginBottom: 12 }}>
                    SHIFT COMPLETED
                  </Text>
                  <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginBottom: 4 }}>
                    {`How was your experience with ${doctorRatingHospitalName || 'this hospital'}?`}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginBottom: 20 }}>
                    Share your feedback and help us improve.
                  </Text>
                  {/* Stars */}
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => {
                          console.log('[DoctorLayout] Star rating selected:', n);
                          setDoctorRatingStars(n);
                          setDoctorRatingError('');
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 36, color: n <= doctorRatingStars ? '#F4A261' : '#48484A' }}>★</Text>
                      </TouchableOpacity>
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
                    <TouchableOpacity
                      onPress={handleDoctorRatingDone}
                      activeOpacity={0.8}
                      style={{ flex: 1, backgroundColor: '#3A3A3C', borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>Skip</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSubmitDoctorRating}
                      disabled={submittingDoctorRating}
                      activeOpacity={0.85}
                      style={{ flex: 2, backgroundColor: submittingDoctorRating ? '#636366' : '#FFFFFF', borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }}>
                        {submittingDoctorRating ? 'Submitting...' : 'Submit Rating'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
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

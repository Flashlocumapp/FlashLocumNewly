import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  AppState,
  StyleSheet,
} from 'react-native';
import { Stack, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import DoctorTabBar, { DoctorTabItem } from '@/components/DoctorTabBar';
import { DoctorDispatchContext } from '@/contexts/DoctorDispatchContext';

const EDGE_BASE = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1';

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
  environment: 'Normal' | 'Busy';
  note?: string | null;
  price: number;
  expiry_at?: string;
};

function formatShiftSummary(req: DispatchRequest): string {
  const hours = req.duration_hours;
  const hoursLabel = hours % 1 === 0 ? `${hours}hr.` : `${hours.toFixed(1)}hr.`;
  return `${req.shift_type} • ${req.shift_date} • ${req.start_time} – ${req.end_time} • ${hoursLabel}`;
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
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const [isOnline, setIsOnline] = useState(false);
  const [doctorScreenState, setDoctorScreenState] = useState<DoctorScreenState>('idle');
  const [requestQueue, setRequestQueue] = useState<DispatchRequest[]>([]);
  const [confirmedRequest, setConfirmedRequest] = useState<DispatchRequest | null>(null);
  const [accepting, setAccepting] = useState(false);

  const prevIsOnlineRef = useRef<boolean | undefined>(undefined);
  const callEdgeRef = useRef<(fn: string, body?: object) => Promise<Response | null>>(async () => null);
  const forceSyncRef = useRef<() => Promise<void>>(async () => {});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isOnlineRef = useRef(false);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const callEdge = useCallback(async (fn: string, body?: object) => {
    const token = await getToken();
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
  }, [getToken]);

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

  // Keep stable refs for callEdge and forceSync so the toggle effect never re-fires due to their identity changing
  useEffect(() => { callEdgeRef.current = callEdge; }, [callEdge]);
  useEffect(() => { forceSyncRef.current = forceSync; }, [forceSync]);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  // ── Go-online / Go-offline — only fires when isOnline actually changes ──
  useEffect(() => {
    if (!user) return;
    if (prevIsOnlineRef.current === isOnline) return;
    // Commit immediately — prevents cascade if the async call fails
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
  }, [isOnline, user]); // only isOnline and user — stable refs handle callEdge/forceSync

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

  // ── Realtime subscription ──
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
        console.log('[DoctorLayout] NEW_REQUEST received:', req.id);
        setRequestQueue((prev) => {
          if (prev.some((r) => r.id === req.id)) return prev;
          return [...prev, req];
        });
        if (isOnlineRef.current) {
          setDoctorScreenState('incoming');
        }
      })
      .on('broadcast', { event: 'EVICT_REQUEST' }, (payload) => {
        const evictedId: string = payload.payload?.request_id;
        console.log('[DoctorLayout] EVICT_REQUEST received:', evictedId);
        setRequestQueue((prev) => prev.filter((r) => r.id !== evictedId));
      })
      .subscribe((status) => {
        console.log('[DoctorLayout] dispatch:lagos subscription status:', status);
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
  }, [user]); // intentionally omit isOnline/forceSync to avoid re-subscribing

  // ── Queue → state sync ──
  useEffect(() => {
    if (requestQueue.length > 0 && doctorScreenState === 'idle' && isOnline) {
      console.log('[DoctorLayout] Queue has items, transitioning to incoming');
      setDoctorScreenState('incoming');
    } else if (requestQueue.length === 0 && doctorScreenState === 'incoming') {
      console.log('[DoctorLayout] Queue empty, transitioning to idle');
      setDoctorScreenState('idle');
    }
  }, [requestQueue, isOnline, doctorScreenState]);

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

  // ── Accept ──
  const handleAccept = useCallback(async () => {
    const req = requestQueue[0];
    if (!req || !user) return;
    console.log('[DoctorLayout] Accept button pressed for request:', req.id);
    setAccepting(true);
    try {
      const token = await getToken();
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
      if (!res.ok) throw new Error('Accept failed');
      console.log('[DoctorLayout] Request accepted successfully — transitioning to confirmed');
      setConfirmedRequest(req);
      setDoctorScreenState('confirmed');
      setRequestQueue([]);
    } catch (e: any) {
      console.log('[DoctorLayout] Accept error:', e.message);
      Alert.alert('Error', e.message);
    } finally {
      setAccepting(false);
    }
  }, [requestQueue, user, getToken, forceSync]);

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

  const currentRequest = requestQueue[0] ?? null;
  const showCard = doctorScreenState === 'incoming' && currentRequest !== null;
  const showConfirmed = doctorScreenState === 'confirmed' && confirmedRequest !== null;

  // Fee breakdown
  const feeAmount = currentRequest?.price ?? 0;
  const feeCut = Math.round(feeAmount * 0.15);
  const feeYouReceive = feeAmount - feeCut;
  const feeAmountDisplay = `₦${feeAmount.toLocaleString()}`;
  const feeCutDisplay = `-₦${feeCut.toLocaleString()}`;
  const feeYouReceiveDisplay = `₦${feeYouReceive.toLocaleString()}`;

  const confirmedPriceDisplay = confirmedRequest ? `₦${confirmedRequest.price.toLocaleString()}` : '';
  const confirmedShiftSummary = confirmedRequest ? formatShiftSummary(confirmedRequest) : '';
  const currentEnvironment = currentRequest?.environment ?? '';
  const currentHospitalName = currentRequest?.hospital_name ?? '';
  const currentHospitalAddress = currentRequest?.hospital_address ?? '';
  const currentShiftSummary = currentRequest ? formatShiftSummary(currentRequest) : '';
  const currentNote = currentRequest?.note ?? null;
  const confirmedHospitalName = confirmedRequest?.hospital_name ?? '';
  const confirmedHospitalAddress = confirmedRequest?.hospital_address ?? '';

  const cardPaddingBottom = insets.bottom + 24;

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
    }}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(home)" />
          <Stack.Screen name="(coverage)" />
          <Stack.Screen name="(earnings)" />
          <Stack.Screen name="(account)" />
        </Stack>

        {/* Tab bar — hidden when a request card is showing */}
        {!showCard && !showConfirmed && <DoctorTabBar tabs={TABS} />}

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
            {/* Shift summary */}
            <Text style={styles.shiftSummaryText}>{currentShiftSummary}</Text>
            {/* Note */}
            {!!currentNote && (
              <Text style={styles.noteText}>{currentNote}</Text>
            )}

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

        {/* ── CONFIRMED CARD ── */}
        {showConfirmed && confirmedRequest && (
          <View style={[styles.card, { paddingBottom: cardPaddingBottom }]}>
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <View style={{ width: 36, height: 4, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={styles.confirmedDot} />
              <Text style={styles.confirmedLabel}>COVERAGE CONFIRMED</Text>
            </View>
            <Text style={styles.hospitalName}>{confirmedHospitalName}</Text>
            <Text style={styles.addressText}>{confirmedHospitalAddress}</Text>
            <Text style={styles.shiftSummaryText}>{confirmedShiftSummary}</Text>
            <Text style={styles.confirmedPrice}>{confirmedPriceDisplay}</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={() => {
                  console.log('[DoctorLayout] Cancel Shift pressed');
                  setDoctorScreenState('idle');
                  setConfirmedRequest(null);
                }}
                activeOpacity={0.85}
                style={styles.declineButton}
              >
                <Text style={styles.declineButtonText}>Cancel Shift</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  console.log('[DoctorLayout] Call button pressed');
                }}
                activeOpacity={0.85}
                style={styles.acceptButton}
              >
                <Text style={styles.acceptButtonText}>Call</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
    backgroundColor: '#2C2C2E',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  envText: {
    fontSize: 12,
    color: '#FFFFFF',
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
  shiftSummaryText: {
    fontSize: 13,
    color: '#8E8E93',
    fontFamily: 'Inter_400Regular',
    marginTop: 8,
  },
  noteText: {
    fontSize: 13,
    color: '#8E8E93',
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    fontStyle: 'italic',
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
  confirmedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  confirmedLabel: {
    fontSize: 13,
    color: '#34C759',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
  },
  confirmedPrice: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    marginTop: 16,
  },
});

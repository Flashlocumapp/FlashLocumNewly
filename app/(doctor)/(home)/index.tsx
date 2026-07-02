import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
  Alert,
  ActivityIndicator,
  AppState,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const { height: screenHeight } = Dimensions.get('window');
const SHEET_HEIGHT = screenHeight * 0.45;

const EDGE_BASE = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1';

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

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
};

function formatShiftSummary(req: DispatchRequest): string {
  const [sh, sm] = req.start_time.split(':').map(Number);
  const [eh, em] = req.end_time.split(':').map(Number);
  const hours = req.duration_hours;
  const hoursLabel = hours % 1 === 0 ? `${hours}hr.` : `${hours.toFixed(1)}hr.`;
  return `${req.shift_type} • ${req.shift_date} • ${req.start_time} – ${req.end_time} • ${hoursLabel}`;
}

function DragHandle() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 10 }}>
      <View style={{ width: 36, height: 4, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
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

export default function DoctorHomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const [isOnline, setIsOnline] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [doctorScreenState, setDoctorScreenState] = useState<DoctorScreenState>('idle');
  const [requestQueue, setRequestQueue] = useState<DispatchRequest[]>([]);
  const [confirmedRequest, setConfirmedRequest] = useState<DispatchRequest | null>(null);
  const [accepting, setAccepting] = useState(false);

  const mapRef = useRef<MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const hasAnimatedToUser = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Radar pulse animation
  const radarScale = useRef(new Animated.Value(1)).current;
  const radarOpacity = useRef(new Animated.Value(0.6)).current;

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const callEdge = useCallback(async (fn: string, body?: object) => {
    const token = await getToken();
    if (!token) return null;
    console.log(`[DoctorHome] Calling edge function: ${fn}`, body ?? '');
    const res = await fetch(`${EDGE_BASE}/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    console.log(`[DoctorHome] ${fn} response status:`, res.status);
    return res;
  }, [getToken]);

  const removeCurrentRequest = useCallback(() => {
    setRequestQueue((prev) => {
      const next = prev.slice(1);
      console.log('[DoctorHome] Removed current request, queue length now:', next.length);
      return next;
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const forceSync = useCallback(async () => {
    if (!user) return;
    console.log('[DoctorHome] Force-syncing...');
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
      console.log('[DoctorHome] Force-sync result — requests:', data.requests?.length ?? 0, 'fresh:', freshRequests.length);
      if (freshRequests.length > 0) {
        setRequestQueue(freshRequests);
        setDoctorScreenState('incoming');
      } else {
        // No valid requests — ensure we're in idle state
        setRequestQueue([]);
        if (doctorScreenState === 'incoming') setDoctorScreenState('idle');
      }
    } catch (e: any) {
      console.log('[DoctorHome] Force-sync error:', e.message);
    }
  }, [user, callEdge]);

  // ─── GPS setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    async function startWatching() {
      console.log('[DoctorHome] Requesting location permission');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[DoctorHome] Location permission denied');
        return;
      }
      console.log('[DoctorHome] Location permission granted, fetching immediate fix');
      // One-time immediate fix — snaps map before watch stream fires
      const immediatePos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      if (active) {
        const coords = { latitude: immediatePos.coords.latitude, longitude: immediatePos.coords.longitude };
        console.log('[DoctorHome] Immediate GPS fix:', coords);
        setUserLocation(coords);
        if (!hasAnimatedToUser.current && mapRef.current) {
          hasAnimatedToUser.current = true;
          console.log('[DoctorHome] Animating map to immediate fix');
          mapRef.current.animateToRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 800);
        }
      }
      console.log('[DoctorHome] Starting watch stream');
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 2000,
          distanceInterval: 1,
          mayShowUserSettingsDialog: true,
        },
        (loc) => {
          if (!active) return;
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          console.log('[DoctorHome] Location update:', coords);
          setUserLocation(coords);
          if (!hasAnimatedToUser.current && mapRef.current) {
            hasAnimatedToUser.current = true;
            console.log('[DoctorHome] Animating map to user location');
            mapRef.current.animateToRegion(
              { ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
              800,
            );
          }
        },
      );
    }

    startWatching();

    return () => {
      active = false;
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, []);

  // ─── Radar pulse loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOnline) return;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(radarScale, { toValue: 1.8, duration: 1800, useNativeDriver: true }),
          Animated.timing(radarScale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(radarOpacity, { toValue: 0, duration: 1800, useNativeDriver: true }),
          Animated.timing(radarOpacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline, radarScale, radarOpacity]);

  // ─── Go-online / Go-offline ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const toggle = async () => {
      const fn = isOnline ? 'go-online' : 'go-offline';
      console.log('[DoctorHome] Toggling status:', fn);
      await callEdge(fn);
      if (isOnline) {
        // Just went online — sync queue immediately
        console.log('[DoctorHome] Went online — force-syncing queue');
        await forceSync();
      } else {
        console.log('[DoctorHome] Went offline — clearing queue');
        setRequestQueue([]);
        setDoctorScreenState('idle');
      }
    };
    toggle();
  }, [isOnline, user, callEdge, forceSync]);

  // ─── Heartbeat every 60s while online ───────────────────────────────────────
  useEffect(() => {
    if (!isOnline || !user) return;
    const sendHeartbeat = async () => {
      console.log('[DoctorHome] Sending heartbeat');
      await callEdge('heartbeat');
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60000);
    return () => clearInterval(interval);
  }, [isOnline, user, callEdge]);

  // ─── Realtime subscription to dispatch:lagos ────────────────────────────────
  useEffect(() => {
    if (!user) return;

    console.log('[DoctorHome] Subscribing to dispatch:lagos channel');
    const channel = supabase.channel('dispatch:lagos')
      .on('broadcast', { event: 'NEW_REQUEST' }, (payload) => {
        const req = payload.payload as DispatchRequest & { expiry_at?: string };
        const now = new Date();
        if (req.expiry_at && new Date(req.expiry_at) <= now) {
          console.log('[DoctorHome] NEW_REQUEST already expired, ignoring:', req.id);
          return;
        }
        console.log('[DoctorHome] NEW_REQUEST received:', req.id);
        setRequestQueue((prev) => {
          if (prev.some((r) => r.id === req.id)) return prev;
          return [...prev, req];
        });
      })
      .on('broadcast', { event: 'EVICT_REQUEST' }, (payload) => {
        const evictedId: string = payload.payload?.request_id;
        console.log('[DoctorHome] EVICT_REQUEST received:', evictedId);
        setRequestQueue((prev) => {
          const next = prev.filter((r) => r.id !== evictedId);
          return next;
        });
      })
      .subscribe((status) => {
        console.log('[DoctorHome] dispatch:lagos subscription status:', status);
      });

    channelRef.current = channel;

    return () => {
      console.log('[DoctorHome] Unsubscribing from dispatch:lagos');
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user]);

  // ─── Queue → screen state sync ───────────────────────────────────────────────
  useEffect(() => {
    if (requestQueue.length > 0 && doctorScreenState === 'idle' && isOnline) {
      console.log('[DoctorHome] Queue has items, transitioning to incoming');
      setDoctorScreenState('incoming');
    } else if (requestQueue.length === 0 && doctorScreenState === 'incoming') {
      console.log('[DoctorHome] Queue empty, transitioning to idle');
      setDoctorScreenState('idle');
    }
  }, [requestQueue, isOnline, doctorScreenState]);

  // ─── AppState force-sync on foreground ──────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && isOnline && user) {
        console.log('[DoctorHome] App foregrounded — force-syncing');
        await forceSync();
      }
    });
    return () => sub.remove();
  }, [isOnline, user, forceSync]);

  // ─── Accept handler ──────────────────────────────────────────────────────────
  const handleAccept = async () => {
    const currentRequest = requestQueue[0];
    if (!currentRequest || !user) return;
    console.log('[DoctorHome] Accept button pressed for request:', currentRequest.id);
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
        body: JSON.stringify({ request_id: currentRequest.id }),
      });
      console.log('[DoctorHome] accept-request response status:', res.status);
      if (res.status === 409) {
        console.log('[DoctorHome] Race condition — request already taken');
        Alert.alert('Request Taken', 'Request no longer available.');
        removeCurrentRequest();
        await forceSync();
        return;
      }
      if (!res.ok) throw new Error('Accept failed');
      console.log('[DoctorHome] Request accepted successfully — transitioning to confirmed');
      setConfirmedRequest(currentRequest);
      setDoctorScreenState('confirmed');
      setRequestQueue([]);
    } catch (e: any) {
      console.log('[DoctorHome] Accept error:', e.message);
      Alert.alert('Error', e.message);
    } finally {
      setAccepting(false);
    }
  };

  // ─── Decline handler ─────────────────────────────────────────────────────────
  const handleDecline = async () => {
    const currentRequest = requestQueue[0];
    if (!currentRequest || !user) return;
    console.log('[DoctorHome] Decline button pressed for request:', currentRequest.id);
    try {
      await callEdge('decline-request', { request_id: currentRequest.id });
    } catch {}
    removeCurrentRequest();
  };

  // ─── Toggle online/offline ───────────────────────────────────────────────────
  const handleToggleStatus = () => {
    const next = !isOnline;
    console.log('[DoctorHome] Status toggled:', next ? 'Online' : 'Offline');
    setIsOnline(next);
  };

  if (!fontsLoaded) return null;

  const pillBg = isOnline ? '#34C759' : '#3A3A3C';
  const dotBg = isOnline ? '#FFFFFF' : '#8E8E93';
  const statusText = isOnline ? 'Online' : 'Offline';
  const pillTop = insets.top + 12;
  const sheetPaddingBottom = insets.bottom + 80;

  const showMarker = isOnline && userLocation !== null;
  const currentRequest = requestQueue[0] ?? null;

  // Fee breakdown
  const feeAmount = currentRequest ? currentRequest.price : 0;
  const feeCut = currentRequest ? Math.round(feeAmount * 0.15) : 0;
  const feeYouReceive = feeAmount - feeCut;
  const feeAmountDisplay = `₦${feeAmount.toLocaleString()}`;
  const feeCutDisplay = `-₦${feeCut.toLocaleString()}`;
  const feeYouReceiveDisplay = `₦${feeYouReceive.toLocaleString()}`;
  const confirmedPriceDisplay = confirmedRequest ? `₦${confirmedRequest.price.toLocaleString()}` : '';

  const confirmedShiftSummary = confirmedRequest ? formatShiftSummary(confirmedRequest) : '';

  return (
    <View style={styles.container}>
      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={LAGOS_REGION}
        showsMyLocationButton={false}
        customMapStyle={DESATURATED_MAP_STYLE}
      >
        {showMarker && userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.markerContainer}>
              {/* Soft dark glow — animated scale+opacity */}
              <Animated.View
                style={[
                  styles.radarRing,
                  { transform: [{ scale: radarScale }], opacity: radarOpacity },
                ]}
              />
              {/* Dark charcoal circle background with white stethoscope */}
              <View style={styles.stethoscopeCircle}>
                <MaterialCommunityIcons name="stethoscope" size={28} color="#FFFFFF" />
              </View>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Online/Offline pill */}
      <TouchableOpacity
        onPress={handleToggleStatus}
        activeOpacity={0.85}
        style={[styles.pill, { top: pillTop, backgroundColor: pillBg }]}
      >
        <View style={[styles.pillDot, { backgroundColor: dotBg }]} />
        <Text style={styles.pillText}>{statusText}</Text>
      </TouchableOpacity>

      {/* Bottom sheet */}
      <View style={[styles.sheet, { paddingBottom: sheetPaddingBottom }]}>

        {/* ── IDLE STATE ── */}
        {doctorScreenState === 'idle' && (
          <>
            {/* Decorative drag handle */}
            <View style={styles.dragHandle} />
            {/* Coverage sub-card */}
            <View style={styles.subCard}>
              <Text style={styles.subCardLabel}>COVERAGE</Text>
              <Text style={styles.subCardHeading}>No coverage yet</Text>
              <Text style={styles.subCardBody}>
                Stay online to start receiving dispatch requests.
              </Text>
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              {/* Ratings */}
              <View style={styles.statCard}>
                <View style={styles.statLabelRow}>
                  <Text style={styles.statLabel}>RATINGS</Text>
                  <Feather name="info" size={12} color="#8E8E93" />
                </View>
                <View style={styles.ratingValueRow}>
                  <Text style={styles.statValue}>4.7</Text>
                  <Text style={styles.starIcon}>★</Text>
                </View>
              </View>

              {/* Reliability */}
              <View style={styles.statCard}>
                <View style={styles.statLabelRow}>
                  <Text style={styles.statLabel}>RELIABILITY</Text>
                  <Feather name="info" size={12} color="#8E8E93" />
                </View>
                <Text style={styles.statValue}>100%</Text>
              </View>
            </View>
          </>
        )}

        {/* ── INCOMING STATE ── */}
        {doctorScreenState === 'incoming' && currentRequest && (
          <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 16 }}>
            <DragHandle />

            {/* Row 1: badges */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              {/* New Request pill */}
              <View style={{
                backgroundColor: '#1A3A2A',
                borderColor: '#34C759',
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 5,
              }}>
                <Text style={{ fontSize: 13, color: '#34C759', fontFamily: 'Inter_600SemiBold' }}>
                  New Request
                </Text>
              </View>

              {/* Right badges */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>
                  <Text style={{ color: '#F4A261' }}>★</Text>
                  {' '}5.0
                </Text>
                <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>
                  <Text style={{ color: '#34C759' }}>●</Text>
                  {' '}100%
                </Text>
                <View style={{
                  backgroundColor: '#2C2C2E',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}>
                  <Text style={{ fontSize: 12, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>
                    {currentRequest.environment}
                  </Text>
                </View>
              </View>
            </View>

            {/* Row 2: Hospital name */}
            <Text style={{ fontSize: 26, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginTop: 12 }}>
              {currentRequest.hospital_name}
            </Text>

            {/* Row 3: Address */}
            <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginTop: 4 }}>
              {currentRequest.hospital_address}
            </Text>

            {/* Row 4: Shift summary */}
            <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginTop: 8 }}>
              {formatShiftSummary(currentRequest)}
            </Text>

            {/* Note (optional) */}
            {!!currentRequest.note && (
              <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginTop: 6, fontStyle: 'italic' }}>
                {currentRequest.note}
              </Text>
            )}

            {/* Fee breakdown sub-card */}
            <View style={{
              backgroundColor: '#2C2C2E',
              borderRadius: 16,
              padding: 16,
              marginTop: 16,
            }}>
              <FeeRow label="Amount" value={feeAmountDisplay} />
              <View style={{ height: 1, backgroundColor: '#3A3A3C' }} />
              <FeeRow label="FlashLocum fee - 15%" value={feeCutDisplay} valueColor="#FF453A" />
              <View style={{ height: 1, backgroundColor: '#3A3A3C' }} />
              <FeeRow label="You receive" value={feeYouReceiveDisplay} valueColor="#34C759" />
            </View>

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                onPress={handleDecline}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  backgroundColor: '#2C2C2E',
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>
                  Decline
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAccept}
                disabled={accepting}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {accepting ? (
                  <ActivityIndicator size="small" color="#1C1C1E" />
                ) : (
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1C1C1E' }}>
                    Accept
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── CONFIRMED STATE ── */}
        {doctorScreenState === 'confirmed' && confirmedRequest && (
          <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 16 }}>
            <DragHandle />

            <Text style={{
              fontSize: 11,
              letterSpacing: 1.4,
              color: '#8E8E93',
              fontFamily: 'Inter_600SemiBold',
              marginTop: 8,
            }}>
              NEXT COVERAGE
            </Text>

            <Text style={{
              fontSize: 15,
              color: '#34C759',
              fontFamily: 'Inter_600SemiBold',
              marginTop: 4,
            }}>
              COVERAGE CONFIRMED
            </Text>

            <Text style={{ fontSize: 26, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginTop: 8 }}>
              {confirmedRequest.hospital_name}
            </Text>

            <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginTop: 4 }}>
              {confirmedRequest.hospital_address}
            </Text>

            <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginTop: 8 }}>
              {confirmedShiftSummary}
            </Text>

            <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFFFFF', marginTop: 8 }}>
              {confirmedPriceDisplay}
            </Text>

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => {
                  console.log('[DoctorHome] Cancel Shift pressed');
                  setDoctorScreenState('idle');
                  setConfirmedRequest(null);
                }}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  backgroundColor: '#2C2C2E',
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>
                  Cancel Shift
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  console.log('[DoctorHome] Call button pressed');
                }}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 999,
                  paddingVertical: 16,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Feather name="phone" size={16} color="#1C1C1E" />
                <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1C1C1E' }}>
                  Call
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Marker
  markerContainer: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(28,28,30,0.35)',
  },
  stethoscopeCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A3C',
    alignSelf: 'center',
    marginBottom: 16,
    marginTop: 12,
  },
  // Pill
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 10,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  pillDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pillText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  // Sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  // Coverage sub-card
  subCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 16,
  },
  subCardLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#8E8E93',
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 8,
  },
  subCardHeading: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  subCardBody: {
    fontSize: 14,
    color: '#8E8E93',
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    padding: 16,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#8E8E93',
    fontFamily: 'Inter_600SemiBold',
  },
  ratingValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  starIcon: {
    fontSize: 20,
    color: '#F4A261',
  },
});

const DESATURATED_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];

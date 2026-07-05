import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
  Alert,
  Linking,
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
import { useDoctorDispatch } from '@/contexts/DoctorDispatchContext';
import { supabase } from '@/lib/supabase';
import type { CoverageSession } from '@/contexts/DoctorDispatchContext';

const EDGE_BASE = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1';

const { height: screenHeight } = Dimensions.get('window');
const SHEET_HEIGHT = screenHeight * 0.45;

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatElapsed(startedAt: string): string {
  const diffMs = Date.now() - new Date(startedAt).getTime();
  const totalSec = Math.max(0, Math.floor(diffMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ].join(':');
}

function EnvironmentBadge({ environment }: { environment: string }) {
  const isBusy = environment === 'Busy';
  const bg = isBusy ? '#1A3A2A' : '#F5F5F0';
  const color = isBusy ? '#34C759' : '#1C1C1E';
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontSize: 12, color, fontFamily: 'Inter_600SemiBold' }}>{environment}</Text>
    </View>
  );
}

function DoctorUpcomingCard({
  session,
  onCancel,
  onCall,
}: {
  session: CoverageSession;
  onCancel: () => void;
  onCall: () => void;
}) {
  const shiftStart = formatTime(session.shift_start);
  const shiftEnd = formatTime(session.shift_end);
  const dayLabel = session.shift_date
    ? new Date(session.shift_date).toLocaleDateString('en-US', { weekday: 'short' })
    : '';
  const ratingDisplay = Number(session.doctor_rating).toFixed(1);
  const reliabilityDisplay = Math.round(Number(session.doctor_reliability));

  const isPaused = session.status === 'paused';
  const shiftPillText = isPaused
    ? `${session.shift_type} · Day ${session.current_day} of ${session.coverage_length} · ${shiftStart} – ${shiftEnd}`
    : `${session.shift_type} · ${dayLabel} · ${shiftStart} – ${shiftEnd}`;

  return (
    <View style={styles.subCard}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={styles.subCardLabel}>UPCOMING COVERAGE</Text>
        <EnvironmentBadge environment={session.environment} />
      </View>

      {/* Hospital name + rating row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={[styles.subCardHeading, { flexShrink: 1 }]} numberOfLines={1}>{session.hospital_name}</Text>
        <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginHorizontal: 6 }}>{'|'}</Text>
        <Text style={{ fontSize: 13, color: '#F4A261', fontFamily: 'Inter_400Regular' }}>{'★ '}</Text>
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{ratingDisplay}</Text>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#34C759', marginHorizontal: 6 }} />
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{reliabilityDisplay}</Text>
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{'%'}</Text>
      </View>

      {/* Address */}
      <Text style={[styles.subCardBody, { marginTop: 0 }]} numberOfLines={1}>{session.hospital_address}</Text>

      {/* Shift pill */}
      <View style={styles.shiftPill}>
        <Text style={styles.shiftPillText} numberOfLines={1}>{shiftPillText}</Text>
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <TouchableOpacity
          onPress={() => {
            console.log('[DoctorHome] Cancel shift pressed for session:', session.id);
            onCancel();
          }}
          activeOpacity={0.8}
          style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#DC2626', letterSpacing: 0.3 }}>CANCEL SHIFT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            console.log('[DoctorHome] Call requester pressed for session:', session.id);
            onCall();
          }}
          activeOpacity={0.8}
          style={{ flex: 1, borderWidth: 1.5, borderColor: '#FFFFFF', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FFFFFF', letterSpacing: 0.3 }}>CALL</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DoctorActiveCard({ session }: { session: CoverageSession; onCall: () => void }) {
  const [elapsed, setElapsed] = useState('00:00:00');

  const currentDayLog = session.day_logs?.[session.current_day - 1];
  const startedAt = currentDayLog?.started_at ?? session.started_at;

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(formatElapsed(startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const shiftStart = formatTime(session.shift_start);
  const shiftEnd = formatTime(session.shift_end);
  const ratingDisplay = Number(session.doctor_rating).toFixed(1);
  const reliabilityDisplay = Math.round(Number(session.doctor_reliability));
  const shiftPillText = `${session.shift_type} · ${shiftStart} – ${shiftEnd}`;
  const showDayPill = session.coverage_length > 1;
  const dayPillText = `Day ${session.current_day} of ${session.coverage_length}`;

  return (
    <View style={styles.subCard}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={styles.subCardLabel}>ACTIVE COVERAGE</Text>
        <EnvironmentBadge environment={session.environment} />
      </View>

      {/* Hospital name + rating row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={[styles.subCardHeading, { flexShrink: 1 }]} numberOfLines={1}>{session.hospital_name}</Text>
        <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginHorizontal: 6 }}>{'|'}</Text>
        <Text style={{ fontSize: 13, color: '#F4A261', fontFamily: 'Inter_400Regular' }}>{'★ '}</Text>
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{ratingDisplay}</Text>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#34C759', marginHorizontal: 6 }} />
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{reliabilityDisplay}</Text>
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{'%'}</Text>
      </View>

      {/* Address */}
      <Text style={[styles.subCardBody, { marginTop: 0 }]} numberOfLines={1}>{session.hospital_address}</Text>

      {/* Shift pill */}
      <View style={styles.shiftPill}>
        <Text style={styles.shiftPillText} numberOfLines={1}>{shiftPillText}</Text>
      </View>

      {/* Timer row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>⏱</Text>
          <Text style={{ fontSize: 22, color: '#FFFFFF', fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>{elapsed}</Text>
        </View>
        {showDayPill && (
          <View style={{ backgroundColor: '#1A3A2A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: '#34C759', fontFamily: 'Inter_600SemiBold' }}>{dayPillText}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function DoctorHomeScreen() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const { isOnline, setIsOnline, activeSession, setActiveSession, activeJobCount } = useDoctorDispatch();

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const mapRef = useRef<MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const hasAnimatedToUser = useRef(false);

  // Radar pulse animation
  const radarScale = useRef(new Animated.Value(1)).current;
  const radarOpacity = useRef(new Animated.Value(0.6)).current;

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
      const immediatePos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      console.log('[DoctorHome][GPS-1] getCurrentPosition:', {
        lat: immediatePos.coords.latitude,
        lng: immediatePos.coords.longitude,
        accuracy: immediatePos.coords.accuracy,
        timestamp: new Date(immediatePos.timestamp).toISOString(),
        mapRefReady: !!mapRef.current,
        hasAnimated: hasAnimatedToUser.current,
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
          setUserLocation(coords);
          if (!hasAnimatedToUser.current && mapRef.current) {
            hasAnimatedToUser.current = true;
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

  useEffect(() => {
    console.log('[DoctorHome][MARKER-STATE] userLocation changed:', userLocation);
  }, [userLocation]);

  useEffect(() => {
    console.log('[DoctorHome][ONLINE-STATE] isOnline:', isOnline);
  }, [isOnline]);

  // ─── Toggle online/offline ───────────────────────────────────────────────────
  const handleToggleStatus = () => {
    if (isJobCapReached) return;
    const next = !isOnline;
    console.log('[DoctorHome] Status pill pressed — toggling to:', next ? 'Online' : 'Offline');
    setIsOnline(next);
  };

  // ─── Cancel shift ────────────────────────────────────────────────────────────
  const handleCancelShift = useCallback(() => {
    if (!activeSession) return;
    Alert.alert('Cancel Shift?', 'This will cancel the booking.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Shift',
        style: 'destructive',
        onPress: async () => {
          console.log('[DoctorHome] Cancel shift confirmed for session:', activeSession.id);
          try {
            const { data: { session: authSession } } = await supabase.auth.getSession();
            const token = authSession?.access_token;
            if (!token) throw new Error('Not authenticated');
            const res = await fetch(`${EDGE_BASE}/update-shift-status`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: activeSession.id, status: 'cancelled' }),
            });
            console.log('[DoctorHome] update-shift-status response:', res.status);
            if (!res.ok) {
              const errText = await res.text().catch(() => '');
              throw new Error(errText || 'Cancel failed');
            }
            setActiveSession(null);
          } catch (e: any) {
            console.log('[DoctorHome] Cancel shift error:', e.message);
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }, [activeSession, setActiveSession]);

  // ─── Call requester ──────────────────────────────────────────────────────────
  const handleCallRequester = useCallback(() => {
    if (!activeSession?.requester_phone) {
      Alert.alert('No phone number available');
      return;
    }
    console.log('[DoctorHome] Call requester pressed:', activeSession.requester_phone);
    Linking.openURL(`tel:${activeSession.requester_phone}`);
  }, [activeSession]);

  if (!fontsLoaded) return null;

  const isJobCapReached = activeJobCount >= 3;
  const pillBg = isJobCapReached ? '#3A3A3C' : isOnline ? '#34C759' : '#3A3A3C';
  const dotBg = isJobCapReached ? '#8E8E93' : isOnline ? '#FFFFFF' : '#8E8E93';
  const statusText = isJobCapReached ? '3 Jobs Active' : isOnline ? 'Online' : 'Offline';
  const pillTop = insets.top + 12;
  const sheetPaddingBottom = insets.bottom + 80;

  const showMarker = isOnline && userLocation !== null;

  // Determine which sub-card to show
  const hasActiveSession = activeSession !== null;
  const isUpcomingOrPaused = hasActiveSession && (activeSession.status === 'upcoming' || activeSession.status === 'paused');
  const isActive = hasActiveSession && activeSession.status === 'active';

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
              <Animated.View
                style={[
                  styles.radarRing,
                  { transform: [{ scale: radarScale }], opacity: radarOpacity },
                ]}
              />
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
        activeOpacity={isJobCapReached ? 1 : 0.85}
        style={[styles.pill, { top: pillTop, backgroundColor: pillBg }]}
        disabled={isJobCapReached}
      >
        <View style={[styles.pillDot, { backgroundColor: dotBg }]} />
        <Text style={styles.pillText}>{statusText}</Text>
      </TouchableOpacity>

      {/* Bottom sheet */}
      <View style={[styles.sheet, { paddingBottom: sheetPaddingBottom }]}>
        {/* Decorative drag handle */}
        <View style={styles.dragHandle} />

        {/* Coverage sub-card — conditional */}
        {!hasActiveSession && (
          <View style={styles.subCard}>
            <Text style={styles.subCardLabel}>COVERAGE</Text>
            <Text style={styles.subCardHeading}>No coverage yet</Text>
            <Text style={styles.subCardBody}>
              Stay online to start receiving dispatch requests.
            </Text>
          </View>
        )}

        {isUpcomingOrPaused && activeSession && (
          <DoctorUpcomingCard
            session={activeSession}
            onCancel={handleCancelShift}
            onCall={handleCallRequester}
          />
        )}

        {isActive && activeSession && (
          <DoctorActiveCard
            session={activeSession}
            onCall={handleCallRequester}
          />
        )}

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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
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
  subCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 0,
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
  shiftPill: {
    backgroundColor: '#3A3A3C',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  shiftPillText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontFamily: 'Inter_400Regular',
  },
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

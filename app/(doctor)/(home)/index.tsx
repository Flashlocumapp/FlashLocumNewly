import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Alert,
  Linking,
  ScrollView,
  Modal,
  Pressable,
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
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { CoverageSession } from '@/contexts/DoctorDispatchContext';
import { getCached, setCached } from '@/utils/tabCache';

const EDGE_BASE = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1';

// Module-level flag — survives tab switches / screen remounts
let _hasAnimatedToUser = false;
// Module-level coord cache — survives tab switches (screen remounts)
let _cachedDoctorCoords: { latitude: number; longitude: number } | null = null;

const { height: screenHeight } = Dimensions.get('window');
const SHEET_HEIGHT = screenHeight * 0.45;

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
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

function buildShiftPillText(session: CoverageSession): string {
  const shiftMs = new Date(session.shift_end).getTime() - new Date(session.shift_start).getTime();
  const msHours = shiftMs / (1000 * 60 * 60);
  const shiftHours = (session.per_day_hours && Number(session.per_day_hours) > 0)
    ? Number(session.per_day_hours)
    : (msHours > 0 ? msHours : 24);
  const totalHours = shiftHours * session.coverage_length;
  const hoursDisplay = totalHours % 1 === 0 ? `${totalHours}hr` : `${totalHours.toFixed(1)}hr`;
  const priceDisplay = `₦${Number(session.price).toLocaleString()}`;
  const shiftStart = formatTime(session.shift_start);
  const shiftEnd = formatTime(session.shift_end);
  const sep = ' · ';

  if (session.status === 'paused') {
    return `${session.shift_type}${sep}Day ${session.current_day} of ${session.coverage_length}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
  }

  if (shiftHours >= 24) {
    const startDate = new Date(session.shift_date);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
    const startDay = startDate.toLocaleDateString('en-US', { weekday: 'short' });
    const endDay = endDate.toLocaleDateString('en-US', { weekday: 'short' });
    return `${session.shift_type}${sep}${startDay} - ${endDay}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
  }

  if (session.coverage_length > 1) {
    const startDate = new Date(session.shift_date);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + session.coverage_length - 1);
    const startDay = startDate.toLocaleDateString('en-US', { weekday: 'short' });
    const endDay = endDate.toLocaleDateString('en-US', { weekday: 'short' });
    return `${session.shift_type}${sep}${startDay} - ${endDay}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
  }

  const dayLabel = new Date(session.shift_date).toLocaleDateString('en-US', { weekday: 'short' });
  return `${session.shift_type}${sep}${dayLabel}${sep}${shiftStart} - ${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
}

function EnvironmentBadge({ environment }: { environment: string }) {
  const bg = '#F5F5F0';
  const color = '#1C1C1E';
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
  const [liveRequesterRating, setLiveRequesterRating] = useState<number | null>(null);
  const [liveRequesterReliability, setLiveRequesterReliability] = useState<number | null>(null);

  useEffect(() => {
    if (!session.requester_id) return;
    console.log('[Doctor Home] Fetching live requester stats for requester_id:', session.requester_id);
    supabase
      .from('requester_profiles')
      .select('rating, reliability')
      .eq('id', session.requester_id)
      .single()
      .then(({ data }) => {
        if (data) {
          console.log('[Doctor Home] Live requester stats fetched:', data);
          setLiveRequesterRating(data.rating ?? null);
          setLiveRequesterReliability(data.reliability ?? null);
        }
      });
  }, [session.requester_id]);

  const requesterRatingDisplay = liveRequesterRating != null
    ? liveRequesterRating.toFixed(1)
    : (session.requester_rating != null ? Number(session.requester_rating).toFixed(1) : '5.0');
  const reliabilityDisplay = liveRequesterReliability != null
    ? Math.round(liveRequesterReliability)
    : (session.requester_reliability != null ? Math.round(Number(session.requester_reliability)) : 100);
  const shiftPillText = buildShiftPillText(session);
  const canCancel = session.status === 'upcoming' && session.current_day === 1;

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
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{requesterRatingDisplay}</Text>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#34C759', marginHorizontal: 6 }} />
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
        {canCancel && (
          <TouchableOpacity
            onPress={() => {
              onCancel();
            }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E', letterSpacing: 0.3 }}>CANCEL SHIFT</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => {
            onCall();
          }}
          activeOpacity={0.8}
          style={{ flex: 1, backgroundColor: '#0A0A0A', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF', letterSpacing: 0.3 }}>CALL</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DoctorActiveCard({ session, onCall }: { session: CoverageSession; onCall: () => void }) {
  const [elapsed, setElapsed] = useState('00:00:00');
  const [liveRequesterRating, setLiveRequesterRating] = useState<number | null>(null);
  const [liveRequesterReliability, setLiveRequesterReliability] = useState<number | null>(null);

  const currentDayLog = session.day_logs?.[session.current_day - 1];
  const startedAt = currentDayLog?.started_at ?? session.started_at;

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(formatElapsed(startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  useEffect(() => {
    if (!session.requester_id) return;
    console.log('[Doctor Home] Fetching live requester stats for active session, requester_id:', session.requester_id);
    supabase
      .from('requester_profiles')
      .select('rating, reliability')
      .eq('id', session.requester_id)
      .single()
      .then(({ data }) => {
        if (data) {
          console.log('[Doctor Home] Live requester stats fetched (active):', data);
          setLiveRequesterRating(data.rating ?? null);
          setLiveRequesterReliability(data.reliability ?? null);
        }
      });
  }, [session.requester_id]);

  const requesterRatingDisplay = liveRequesterRating != null
    ? liveRequesterRating.toFixed(1)
    : (session.requester_rating != null ? Number(session.requester_rating).toFixed(1) : '5.0');
  const reliabilityDisplay = liveRequesterReliability != null
    ? Math.round(liveRequesterReliability)
    : (session.requester_reliability != null ? Math.round(Number(session.requester_reliability)) : 100);
  const shiftPillText = buildShiftPillText(session);
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
        <Text style={{ fontSize: 13, color: '#FFFFFF', fontFamily: 'Inter_400Regular' }}>{requesterRatingDisplay}</Text>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#34C759', marginHorizontal: 6 }} />
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

      {/* Call button */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <TouchableOpacity
          onPress={() => { onCall(); }}
          activeOpacity={0.8}
          style={{ flex: 1, backgroundColor: '#0A0A0A', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF', letterSpacing: 0.3 }}>CALL</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function DoctorHomeScreen() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const { user } = useAuth();

  const { isOnline, setIsOnline, goOnline, activeSession, setActiveSession, activeJobCount, isJobCapReached } = useDoctorDispatch();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCancelReasons, setShowCancelReasons] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState<'rating' | 'reliability' | null>(null);

  // Live rating/reliability state — seeded from cache to avoid flicker
  const _cachedScores = getCached<{ rating: number; reliability: number }>('doctor_scores');
  const [doctorRating, setDoctorRating] = useState<number | null>(_cachedScores?.rating ?? null);
  const [doctorReliability, setDoctorReliability] = useState<number | null>(_cachedScores?.reliability ?? null);

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
          setDoctorRating(data.rating ?? null);
          setDoctorReliability(data.reliability ?? null);
          setCached('doctor_scores', { rating: data.rating ?? 5.0, reliability: data.reliability ?? 100 });
        }
      } catch (e: any) {
        // ignore
      }
    })();
  }, [user]);

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    _cachedDoctorCoords
  );

  const mapRef = useRef<MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  // ─── tracksViewChanges fix for stethoscope blank on first toggle ────────────
  const [markerTracksViews, setMarkerTracksViews] = useState(true);

  // ─── GPS setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    async function startWatching() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }
      const immediatePos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      if (active) {
        const coords = { latitude: immediatePos.coords.latitude, longitude: immediatePos.coords.longitude };
        _cachedDoctorCoords = coords;
        setUserLocation(coords);
        if (!_hasAnimatedToUser && mapRef.current) {
          _hasAnimatedToUser = true;
          mapRef.current.animateToRegion({ ...coords, latitudeDelta: 0.12, longitudeDelta: 0.12 }, 800);
        }
      }
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
          _cachedDoctorCoords = coords;
          setUserLocation(coords);
          if (!_hasAnimatedToUser && mapRef.current) {
            _hasAnimatedToUser = true;
            mapRef.current.animateToRegion(
              { ...coords, latitudeDelta: 0.12, longitudeDelta: 0.12 },
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

  // ─── tracksViewChanges: reset to true briefly when marker appears ───────────
  const showMarker = isOnline && userLocation !== null;
  useEffect(() => {
    if (!showMarker) return;
    setMarkerTracksViews(true);
    const t = setTimeout(() => setMarkerTracksViews(false), 500);
    return () => clearTimeout(t);
  }, [showMarker]);

  // ─── Toggle online/offline ───────────────────────────────────────────────────
  const handleToggleStatus = () => {
    if (isJobCapReached) return;
    const next = !isOnline;
    if (next) {
      const coords = userLocation
        ? { lat: userLocation.latitude, lng: userLocation.longitude }
        : undefined;
      goOnline(coords);
    } else {
      setIsOnline(false);
    }
  };

  // ─── Cancel shift ────────────────────────────────────────────────────────────
  const handleCancelShift = useCallback(() => {
    if (!activeSession) return;
    setShowCancelModal(true);
  }, [activeSession]);

  const handleConfirmCancelShift = () => {
    setShowCancelModal(false);
    setShowCancelReasons(true);
  };

  const handleCancelReasonSelected = async (reason: string) => {
    if (!activeSession) return;
    setShowCancelReasons(false);
    try {
      const res = await fetchWithAuth(`${EDGE_BASE}/update-shift-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSession.id, status: 'cancelled', cancellation_reason: reason, cancelled_by: 'doctor' }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || 'Cancel failed');
      }
      setActiveSession(null);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  // ─── Call requester ──────────────────────────────────────────────────────────
  const handleCallRequester = useCallback(() => {
    if (!activeSession?.requester_phone) {
      Alert.alert('No phone number available');
      return;
    }
    Linking.openURL(`tel:${activeSession.requester_phone}`);
  }, [activeSession]);

  if (!fontsLoaded) return null;

  const pillBg = isJobCapReached ? '#3A3A3C' : isOnline ? '#34C759' : '#3A3A3C';
  const dotBg = isJobCapReached ? '#8E8E93' : isOnline ? '#FFFFFF' : '#8E8E93';
  const statusText = isJobCapReached ? 'Max Shifts Reached' : isOnline ? 'Online' : 'Offline';
  const showCapSubtext = isJobCapReached && !isOnline;
  const pillTop = insets.top + 12;
  const sheetPaddingBottom = 80 + 16;

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
        minZoomLevel={10}
        maxZoomLevel={18}
      >
        {showMarker && userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={markerTracksViews}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="stethoscope" size={20} color="#FFFFFF" />
              </View>
          </Marker>
        )}
      </MapView>

      {/* Online/Offline pill */}
      <TouchableOpacity
        onPress={handleToggleStatus}
        activeOpacity={isJobCapReached ? 1 : 0.85}
        style={[styles.pill, { top: pillTop, backgroundColor: pillBg, flexDirection: showCapSubtext ? 'column' : 'row', alignItems: 'center', gap: showCapSubtext ? 2 : 8 }]}
        disabled={isJobCapReached}
      >
        {showCapSubtext ? (
          <>
            <Text style={styles.pillText}>{statusText}</Text>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93' }}>Complete a shift to go online</Text>
          </>
        ) : (
          <>
            <View style={[styles.pillDot, { backgroundColor: dotBg }]} />
            <Text style={styles.pillText}>{statusText}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Bottom sheet */}
      <View style={styles.sheet}>
        <ScrollView
          scrollEnabled={true}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.sheetContent, { paddingBottom: sheetPaddingBottom }]}
          bounces={false}
        >
          {/* Decorative drag handle */}
          <View style={styles.dragHandle} />

          {/* Coverage sub-card — default fallback, shows when no named card matches */}
          {(!isUpcomingOrPaused && !isActive) && (
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
          <View style={[styles.statsRow, { marginBottom: 4 }]}>
            {/* Ratings */}
            <View style={styles.statCard}>
              <View style={styles.statLabelRow}>
                <Text style={styles.statLabel}>RATINGS</Text>
                <TouchableOpacity onPress={() => { console.log('[Doctor] Info icon pressed: rating tooltip'); setTooltipVisible('rating'); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="info" size={12} color="#8E8E93" />
                </TouchableOpacity>
              </View>
              <View style={styles.ratingValueRow}>
                <Text style={styles.statValue}>{doctorRating !== null ? doctorRating.toFixed(1) : '--'}</Text>
                <Text style={styles.starIcon}>★</Text>
              </View>
            </View>

            {/* Reliability */}
            <View style={styles.statCard}>
              <View style={styles.statLabelRow}>
                <Text style={styles.statLabel}>RELIABILITY</Text>
                <TouchableOpacity onPress={() => { console.log('[Doctor] Info icon pressed: reliability tooltip'); setTooltipVisible('reliability'); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="info" size={12} color="#8E8E93" />
                </TouchableOpacity>
              </View>
              <Text style={styles.statValue}>{doctorReliability !== null ? `${Math.round(doctorReliability)}%` : '--'}</Text>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* ── CANCEL SHIFT CONFIRMATION MODAL ── */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
          onPress={() => setShowCancelModal(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: '#1C1C1E', borderRadius: 24, padding: 28, width: '100%' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' }}>
                Cancel Shift?
              </Text>
              <Text style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
                You have already accepted this shift. Cancelling will affect your reliability score.
              </Text>
              <TouchableOpacity
                onPress={() => setShowCancelModal(false)}
                style={{ backgroundColor: '#F9F9F6', borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1C1C1E' }}>Keep Shift</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmCancelShift}
                style={{ backgroundColor: '#2C2C2E', borderRadius: 999, paddingVertical: 16, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#FF3B30' }}>Cancel Shift</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── CANCEL SHIFT REASON MODAL ── */}
      <Modal
        visible={showCancelReasons}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCancelReasons(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: '#1C1C1E',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 12,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 24,
          }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 4, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 }}>
              Reason for Cancellation
            </Text>
            <Text style={{ fontSize: 14, color: '#8E8E93', marginBottom: 24 }}>
              Help us improve by letting us know why you cancelled.
            </Text>
            {['Personal emergency', 'Medical emergency', 'Transport issue', 'Double booking', 'Other'].map((reason) => (
              <TouchableOpacity
                key={reason}
                onPress={() => handleCancelReasonSelected(reason)}
                style={{ backgroundColor: '#2C2C2E', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text style={{ fontSize: 15, color: '#FFFFFF', fontWeight: '500' }}>{reason}</Text>
                <Text style={{ fontSize: 18, color: '#8E8E93' }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── TOOLTIP MODAL ── */}
      <Modal
        visible={tooltipVisible !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTooltipVisible(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}
          onPress={() => { console.log('[Doctor] Tooltip modal backdrop pressed, closing'); setTooltipVisible(null); }}
        >
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={{ backgroundColor: '#1C1C1E', borderRadius: 20, padding: 24, width: '100%' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 10 }}>
                {tooltipVisible === 'rating' ? 'Ratings' : 'Reliability'}
              </Text>
              <Text style={{ fontSize: 14, color: '#EBEBF5CC', lineHeight: 20 }}>
                {tooltipVisible === 'rating'
                  ? 'Reflects how satisfied requesters are with your service. Minimum: 4.0 stars.'
                  : 'Frequently cancelling accepted shifts may reduce your reliability score. Minimum: 85%'}
              </Text>
              <TouchableOpacity
                onPress={() => { console.log('[Doctor] Tooltip "Got it" pressed:', tooltipVisible); setTooltipVisible(null); }}
                style={{ marginTop: 20, backgroundColor: '#3A3A3C', borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Got it</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    maxHeight: SHEET_HEIGHT,
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContent: {
    flexGrow: 1,
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
  { elementType: 'geometry', stylers: [{ color: '#dde0e3' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#cfd2d5' }] },
  { featureType: 'poi.park', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#cdd0d4' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#c4c8cc' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#a8c4d8' }] },
  { featureType: 'water', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
];

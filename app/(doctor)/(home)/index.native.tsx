import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { IS_EXPO_GO } from '@/utils/expoGoGuard';
import { useNotifications } from '@/contexts/NotificationContext';
import { useSplash } from '@/app/_layout';
import * as Notifications from 'expo-notifications';
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
  Platform,
  Pressable,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { IconSymbol } from '@/components/IconSymbol';
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
import PollingManager from '../../../utils/pollingManager';
import { buildShiftPillText, EnvironmentBadge } from '@/components/DoctorUpcomingCoverageCard';
import { DOCTOR_CANCEL_REASONS } from '@/constants/Theme';
import { SUPABASE_URL } from '@/constants/api';

const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

// Module-level flag — survives tab switches / screen remounts
let _hasAnimatedToUser = false;
// Module-level coord cache — survives tab switches (screen remounts)
let _cachedDoctorCoords: { latitude: number; longitude: number } | null = null;
// Module-level region cache — preserves zoom/pan across tab switches on Android
let _cachedDoctorRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null = null;

const { height: screenHeight } = Dimensions.get('window');
const SHEET_HEIGHT = screenHeight * 0.45;

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const MAP_LAT_OFFSET = -0.03; // shifts centre south → pin appears higher
const MAP_LNG_OFFSET = 0.03;  // shifts centre east → pin appears to the left

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



// ─── HomePaymentPendingContent — renders inside the shared subCard wrapper ────
function HomePaymentPendingContent({ session }: { session: CoverageSession }) {
  const shiftPillText = buildShiftPillText(session);
  return (
    <>
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={styles.subCardLabel}>PAYMENT PENDING</Text>
        <EnvironmentBadge environment={session.environment} />
      </View>

      {/* Hospital name */}
      <Text style={[styles.subCardHeading, { flexShrink: 1 }]} numberOfLines={1}>
        {session.hospital_name}
      </Text>

      {/* Address */}
      <Text style={[styles.subCardBody, { marginTop: 0 }]} numberOfLines={1}>
        {session.hospital_address}
      </Text>

      {/* Shift pill */}
      <View style={styles.shiftPill}>
        <Text style={styles.shiftPillText} numberOfLines={1}>{shiftPillText}</Text>
      </View>

      {/* Amber waiting banner — identical to DoctorUpcomingCoverageCard */}
      <View style={{ backgroundColor: '#3A2A00', borderRadius: 10, padding: 12, marginTop: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#D97706', fontFamily: 'Inter_600SemiBold' }}>
          {'⏳ Waiting for Payment'}
        </Text>
        <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 4, fontFamily: 'Inter_400Regular' }}>
          The requester has been sent a payment request. You will be notified once payment is confirmed.
        </Text>
      </View>
    </>
  );
}

// ─── HomeUpcomingContent — renders inside the shared subCard wrapper ──────────
function HomeUpcomingContent({
  session,
  onCancel,
  onCall,
}: {
  session: CoverageSession;
  onCancel: (s: CoverageSession) => void;
  onCall: (s: CoverageSession) => void;
}) {
  // Frozen session snapshot — never re-fetches, never blinks
  const requesterRatingDisplay = session.requester_rating != null ? Number(session.requester_rating).toFixed(2) : '5.00';
  const reliabilityDisplay = session.requester_reliability != null ? `${Math.round(Number(session.requester_reliability))}` : '100';

  const canCancel = session.status === 'upcoming' && session.current_day === 1;
  const shiftPillText = buildShiftPillText(session);

  return (
    <>
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

      {/* Note */}
      {!!session.note?.trim() && (
        <View style={{
          backgroundColor: '#3A3A3C',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 8,
          marginTop: 10,
        }}>
          <Text style={{
            fontSize: 11,
            fontFamily: 'Inter_600SemiBold',
            color: '#8E8E93',
            letterSpacing: 0.5,
            marginBottom: 3,
          }}>NOTE</Text>
          <Text style={{
            fontSize: 13,
            fontFamily: 'Inter_400Regular',
            color: '#EBEBF5',
            fontStyle: 'italic',
          }}>{session.note}</Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {canCancel && (
          <TouchableOpacity
            onPress={() => { console.log('[Doctor Home] CANCEL SHIFT pressed for session:', session.id); onCancel(session); }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: '#F9F9F6', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E', letterSpacing: 0.3 }}>CANCEL SHIFT</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => { console.log('[Doctor Home] CALL pressed for session:', session.id); onCall(session); }}
          activeOpacity={0.8}
          style={{ flex: 1, backgroundColor: '#0A0A0A', borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF', letterSpacing: 0.3 }}>CALL</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

function DoctorActiveCard({ session, onCall }: { session: CoverageSession; onCall: () => void }) {
  const [elapsed, setElapsed] = useState('00:00:00');
  // Frozen session snapshot — never re-fetches, never blinks
  const requesterRatingDisplay = session.requester_rating != null ? Number(session.requester_rating).toFixed(2) : '5.00';
  const reliabilityDisplay = session.requester_reliability != null ? `${Math.round(Number(session.requester_reliability))}` : '100';

  const currentDayLog = session.day_logs?.[session.current_day - 1];
  const startedAt = currentDayLog?.started_at ?? session.started_at;

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(formatElapsed(startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
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

      {/* Note */}
      {!!session.note?.trim() && (
        <View style={{
          backgroundColor: '#3A3A3C',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 8,
          marginTop: 10,
        }}>
          <Text style={{
            fontSize: 11,
            fontFamily: 'Inter_600SemiBold',
            color: '#8E8E93',
            letterSpacing: 0.5,
            marginBottom: 3,
          }}>NOTE</Text>
          <Text style={{
            fontSize: 13,
            fontFamily: 'Inter_400Regular',
            color: '#EBEBF5',
            fontStyle: 'italic',
          }}>{session.note}</Text>
        </View>
      )}

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
  const { user, profile } = useAuth();
  useNotifications();
  const verificationStatus = profile?.verification_status ?? null;
  const isVerified = verificationStatus === 'verified';
  const isPending = verificationStatus === 'pending';
  const isUnderReview = verificationStatus === 'under_review';
  const isRejected = verificationStatus === 'rejected';
  const isSuspended = verificationStatus === 'suspended';
  const isBlocked = !isVerified; // covers all non-verified states
  // null means profile not yet loaded — show nothing
  const isProfileLoading = verificationStatus === null;

  const { isOnline, setIsOnline, goOnline, activeSession, setActiveSession, activeJobCount, isJobCapReached, upcomingSessions, setUpcomingSessions, reconcileUpcomingSessions, criticalDataReady, doctorRatingScore, doctorReliabilityScore } = useDoctorDispatch();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCancelReasons, setShowCancelReasons] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState<'rating' | 'reliability' | null>(null);


  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    _cachedDoctorCoords
  );

  const mapRef = useRef<MapView>(null);

  // ─── tracksViewChanges fix for stethoscope blank on first toggle ────────────
  const [markerTracksViews, setMarkerTracksViews] = useState(true);

  // ─── GPS setup — location is fetched after PermissionsOverlay grants access ──
  // (silent on-mount request removed; location is obtained in handlePermissionsAllGranted)

  // ─── Send location update when GPS resolves while already online with null coords ──
  // If the doctor tapped Go Online before GPS resolved, go-online was called with
  // undefined coords → lat/lng = null in DB → invisible on requester map.
  // This effect fires when userLocation first becomes non-null and patches lat/lng
  // directly — no full go-online call, no new toggle cycle, no is_online change event.
  const sentInitialLocationRef = useRef(false);
  useEffect(() => {
    if (!userLocation) return;
    if (!isOnline) return;
    if (sentInitialLocationRef.current) return;
    sentInitialLocationRef.current = true;
    const coords = { lat: userLocation.latitude, lng: userLocation.longitude };
    console.log('[DoctorHome] GPS resolved while online — patching lat/lng directly:', coords);
    supabase
      .from('doctor_profiles')
      .update({ lat: coords.lat, lng: coords.lng })
      .eq('id', user?.id ?? '')
      .then(({ error }) => {
        if (error) console.log('[DoctorHome] Failed to patch lat/lng:', error.message);
      });
  }, [userLocation, isOnline, user?.id]);

  // Reset sentInitialLocationRef when doctor goes offline so the next go-online
  // cycle can send the location again if GPS resolves after the toggle.
  useEffect(() => {
    if (!isOnline) {
      sentInitialLocationRef.current = false;
    }
  }, [isOnline]);

  // ─── Coordinate recovery — fires when isOnline=true but userLocation=null ────
  // Triggered by JS process restart (app kill+relaunch or OS memory eviction)
  // while the doctor was online. Recovers in priority order without any permission prompt.
  const coordRecoveryInFlightRef = useRef(false);
  useEffect(() => {
    if (!isOnline || userLocation !== null) return;
    if (coordRecoveryInFlightRef.current) return; // guard: no overlapping requests
    coordRecoveryInFlightRef.current = true;
    console.log('[DoctorHome] Coordinate recovery triggered: isOnline=true, userLocation=null');
    (async () => {
      try {
        // Step 1: module-level cache (same JS session — tab switch or brief remount)
        if (_cachedDoctorCoords) {
          console.log('[DoctorHome] Coordinate recovery: restored from module cache');
          setUserLocation(_cachedDoctorCoords);
          // Move camera to match — same logic as handleToggleStatus
          if (mapRef.current) {
            mapRef.current.animateToRegion({
              latitude: _cachedDoctorCoords.latitude + MAP_LAT_OFFSET,
              longitude: _cachedDoctorCoords.longitude + MAP_LNG_OFFSET,
              latitudeDelta: 0.12,
              longitudeDelta: 0.12,
            }, 800);
          }
          return;
        }
        // Step 2: DB — doctor_profiles.lat/lng (last online position, survives process kill)
        if (user?.id) {
          try {
            const { data } = await supabase
              .from('doctor_profiles')
              .select('lat, lng')
              .eq('id', user.id)
              .single();
            if (data?.lat && data?.lng) {
              const coords = { latitude: data.lat, longitude: data.lng };
              _cachedDoctorCoords = coords;
              console.log('[DoctorHome] Coordinate recovery: restored from DB', coords);
              setUserLocation(coords);
              // Move camera to match — same logic as handleToggleStatus
              if (mapRef.current) {
                mapRef.current.animateToRegion({
                  latitude: coords.latitude + MAP_LAT_OFFSET,
                  longitude: coords.longitude + MAP_LNG_OFFSET,
                  latitudeDelta: 0.12,
                  longitudeDelta: 0.12,
                }, 800);
              }
              return;
            }
          } catch { /* non-fatal */ }
        }
        // Step 3: OS last-known position — no age restriction, no permission prompt
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== 'granted') return; // no prompt — silent exit
          const pos = await Location.getLastKnownPositionAsync();
          if (pos) {
            const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            _cachedDoctorCoords = coords;
            console.log('[DoctorHome] Coordinate recovery: restored from last-known position', coords);
            setUserLocation(coords);
            // Move camera to match — same logic as handleToggleStatus
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: coords.latitude + MAP_LAT_OFFSET,
                longitude: coords.longitude + MAP_LNG_OFFSET,
                latitudeDelta: 0.12,
                longitudeDelta: 0.12,
              }, 800);
            }
            return;
          }
        } catch { /* non-fatal */ }
        // Step 4: live GPS — only if permission already granted (confirmed above)
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          _cachedDoctorCoords = coords;
          console.log('[DoctorHome] Coordinate recovery: restored from live GPS', coords);
          setUserLocation(coords);
          // Move camera to match — same logic as handleToggleStatus
          if (mapRef.current) {
            mapRef.current.animateToRegion({
              latitude: coords.latitude + MAP_LAT_OFFSET,
              longitude: coords.longitude + MAP_LNG_OFFSET,
              latitudeDelta: 0.12,
              longitudeDelta: 0.12,
            }, 800);
          }
        } catch { /* non-fatal */ }
      } finally {
        coordRecoveryInFlightRef.current = false;
      }
    })();
  }, [isOnline, userLocation, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── tracksViewChanges: keep true permanently on both platforms ──────────────
  // iOS snapshot-invalidation bugs (resume, tab-switch, first render) are
  // eliminated by never freezing tracksViewChanges. Single marker — negligible cost.
  const showMarker = isOnline && userLocation !== null;
  useEffect(() => {
    if (!showMarker) return;
    setMarkerTracksViews(true);
    // No timeout on either platform — keep live-rendering permanently.
    return undefined;
  }, [showMarker]);

  // ─── Re-focus map on tab return ──────────────────────────────────────────────
  useFocusEffect(
    React.useCallback(() => {
      const doAnimate = () => {
        if (_cachedDoctorCoords && mapRef.current) {
          const targetRegion = {
            latitude: _cachedDoctorCoords.latitude + MAP_LAT_OFFSET,
            longitude: _cachedDoctorCoords.longitude + MAP_LNG_OFFSET,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12,
          };
          try {
            mapRef.current.animateToRegion(targetRegion, 600);
          } catch {
            // map not ready
          }
        }
      };
      const t1 = setTimeout(doAnimate, 300);
      const t2 = setTimeout(doAnimate, 800);
      const t3 = setTimeout(doAnimate, 1500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }, [])
  );

  // ─── Signal splash screen ready — wait for criticalDataReady + profile ──────
  const { signalScreenReady, splashDismissed } = useSplash();
  const splashSignalledRef = useRef(false);
  useEffect(() => {
    if (splashSignalledRef.current) return;
    if (!criticalDataReady) return; // wait until layout has fetched activeSession + isOnline
    if (!profile) return; // wait until profile is known
    splashSignalledRef.current = true;
    signalScreenReady();
  }, [criticalDataReady, profile, signalScreenReady]);

  // ── One-time notification permission request ──────────────────────────────
  // The OS permission status is always authoritative. The SecureStore flag is
  // only used to suppress the auto-prompt when permission is permanently denied
  // (canAskAgain=false) so we do not repeatedly open Settings on every launch.
  // For every other state the OS is re-checked on each eligible entry.
  useEffect(() => {
    if (!criticalDataReady || !splashDismissed || !user?.id) return;
    if (IS_EXPO_GO) return;
    (async () => {
      try {
        // Read authoritative OS permission state
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status === 'granted') return; // already granted — nothing to do
        if (!canAskAgain) {
          // Permanently denied. Only open Settings if the user explicitly taps
          // a notification-related UI element — do not auto-redirect on launch.
          return;
        }
        // Undetermined or denied-but-can-ask-again: show the native prompt
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const OneSignal = require('react-native-onesignal').OneSignal;
        await OneSignal.Notifications.requestPermission(true);
      } catch (e) {
        console.log('[DoctorHome] Notification permission request error:', e);
      }
    })();
  }, [criticalDataReady, splashDismissed, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Toggle online/offline ───────────────────────────────────────────────────
  const handleToggleStatus = async () => {
    console.log('[DoctorHome] handleToggleStatus pressed — verificationStatus:', verificationStatus, 'isOnline:', isOnline);
    if (!isVerified) return; // verification gate
    if (isJobCapReached) return;
    const next = !isOnline;
    if (next) {
      // ── Location permission gate ──────────────────────────────────────────────
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          // Permanently denied — send to Settings
          Alert.alert(
            'Location Required',
            'FlashLocum needs your location to show you to nearby requesters. Please enable it in Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }
        // Ask natively
        const result = await Location.requestForegroundPermissionsAsync();
        if (result.status !== 'granted') {
          Alert.alert(
            'Location Required',
            'Location access is needed to go Online. You can enable it in Settings.',
            [{ text: 'OK' }]
          );
          return;
        }
      }
      // Location granted — fetch coords and go online
      try {
        let pos = await Location.getLastKnownPositionAsync({ maxAge: 30000, requiredAccuracy: 500 });
        console.log('[handleToggleStatus] getLastKnownPositionAsync result:', pos ? `lat=${pos.coords.latitude}, lon=${pos.coords.longitude}` : 'null — falling back to getCurrentPositionAsync');
        if (!pos) {
          console.log('[handleToggleStatus] Requesting fresh location via getCurrentPositionAsync');
          pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        }
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        _cachedDoctorCoords = coords;
        setUserLocation(coords);
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: coords.latitude + MAP_LAT_OFFSET,
            longitude: coords.longitude + MAP_LNG_OFFSET,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12,
          }, 800);
        }
        goOnline({ lat: coords.latitude, lng: coords.longitude });
      } catch {
        goOnline(undefined);
      }
    } else {
      setIsOnline(false);
    }
  };

  // ─── Cancel shift ────────────────────────────────────────────────────────────
  const [pendingCancelSession, setPendingCancelSession] = useState<CoverageSession | null>(null);

  const handleCancelShift = useCallback((session?: CoverageSession) => {
    console.log('[DoctorHome] handleCancelShift pressed for session:', session?.id ?? activeSession?.id);
    setPendingCancelSession(session ?? null);
    setShowCancelModal(true);
  }, [activeSession]);

  const handleConfirmCancelShift = () => {
    setShowCancelModal(false);
    setShowCancelReasons(true);
  };

  const handleCancelReasonSelected = async (reason: string) => {
    const sessionToCancel = pendingCancelSession;
    if (!sessionToCancel) return;
    const sessionId = sessionToCancel.id;
    setShowCancelReasons(false);
    setPendingCancelSession(null);

    // Optimistic removal from upcoming list immediately
    setUpcomingSessions((prev) => prev.filter((s) => s.id !== sessionId));

    const doCancelRequest = async () => {
      console.log('[Doctor] handleCancelReasonSelected: cancelling session', sessionId, 'reason:', reason);
      const res = await fetchWithAuth(`${EDGE_BASE}/update-shift-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, status: 'cancelled', cancellation_reason: reason, cancelled_by: 'doctor' }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || 'Cancel failed');
      }
    };

    const startCancelPoll = () => {
      console.log('[Doctor] Starting cancel poll for session:', sessionId);
      PollingManager.start(`cancel-doctor-${sessionId}`, async () => {
        const { data: s } = await supabase
          .from('coverage_sessions')
          .select('status')
          .eq('id', sessionId)
          .maybeSingle();
        if (s?.status === 'cancelled') {
          reconcileUpcomingSessions();
          return true;
        }
        return false;
      }, undefined, 6);
    };

    try {
      await doCancelRequest();
      // Server confirmed — reconcile to ensure consistency
      reconcileUpcomingSessions();
      startCancelPoll();
    } catch (e: any) {
      const isNetworkErr = e instanceof TypeError &&
        (e.message?.includes('Network request failed') || e.message?.includes('network'));
      if (isNetworkErr) {
        console.log('[Doctor] Network error on cancel — retrying in 1s');
        await new Promise(r => setTimeout(r, 1000));
        try {
          await doCancelRequest();
          reconcileUpcomingSessions();
          startCancelPoll();
          return;
        } catch (retryErr: any) {
          // Revert optimistic removal on failure
          reconcileUpcomingSessions();
          Alert.alert('Something went wrong', retryErr.message || 'Please try again.');
          return;
        }
      }
      // Revert optimistic removal on failure
      reconcileUpcomingSessions();
      Alert.alert('Error', e.message);
    }
  };

  // ─── Call requester ──────────────────────────────────────────────────────────
  const handleCallRequester = useCallback((session?: CoverageSession) => {
    const phone = session?.requester_phone ?? activeSession?.requester_phone;
    console.log('[DoctorHome] handleCallRequester pressed — phone:', phone, 'session:', session?.id ?? activeSession?.id);
    if (!phone) {
      Alert.alert('No phone number available');
      return;
    }
    Linking.openURL(`tel:${phone}`);
  }, [activeSession]);

  if (!fontsLoaded) return null;

  const pillBg = isJobCapReached ? '#3A3A3C' : isOnline ? '#34C759' : '#3A3A3C';
  const dotBg = isJobCapReached ? '#8E8E93' : isOnline ? '#FFFFFF' : '#8E8E93';
  const statusText = isJobCapReached ? 'Max Shifts Reached' : isOnline ? 'Online' : 'Offline';
  const showCapSubtext = isJobCapReached && !isOnline;
  const pillTop = insets.top + 12;
  const sheetPaddingBottom = 80 + 16 + (Platform.OS === 'android' ? insets.bottom : 0);

  // Determine which single sub-card to show (strict priority — never more than one)
  const homeCardSession: CoverageSession | null = (() => {
    if (activeSession) {
      if (activeSession.status === 'active' || activeSession.status === 'paused') return activeSession;
      if (activeSession.status === 'payment_pending') return activeSession;
    }
    const activeLive = upcomingSessions.find(s => s.status === 'active' || s.status === 'paused');
    if (activeLive) return activeLive;
    const pendingLive = upcomingSessions.find(s => s.status === 'payment_pending');
    if (pendingLive) return pendingLive;
    const upcomingOnly = upcomingSessions.filter(s => s.status === 'upcoming');
    if (upcomingOnly.length === 0) return null;
    return upcomingOnly.reduce((earliest, s) =>
      new Date(s.shift_start) < new Date(earliest.shift_start) ? s : earliest
    );
  })();
  const homeCardStatus = homeCardSession?.status ?? null;
  const showActive = homeCardStatus === 'active';
  const showPaymentPending = homeCardStatus === 'payment_pending';
  const showUpcomingOrPaused = homeCardStatus === 'upcoming' || homeCardStatus === 'paused';

  return (
    <View style={styles.container}>
      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={_cachedDoctorRegion ?? LAGOS_REGION}
        onRegionChangeComplete={(region) => { _cachedDoctorRegion = region; }}
        onMapReady={() => {}}
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
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="stethoscope" size={13} color="#FFFFFF" />
              </View>
          </Marker>
        )}
      </MapView>

      {/* Verification gate / Online-Offline pill */}
      {isProfileLoading ? (
        // Profile not yet loaded — render nothing (splash is still visible or neutral)
        null
      ) : isPending ? (
        <View style={[styles.pill, { top: pillTop, backgroundColor: '#1C1C1E', flexDirection: 'column', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="clock-outline" size={14} color="#FF9F0A" />
            <Text style={[styles.pillText, { color: '#FF9F0A' }]}>Under Review</Text>
          </View>
          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93', textAlign: 'center' }}>
            Your account is currently under review.{'\n'}This process usually takes 24–48hrs.
          </Text>
        </View>
      ) : isUnderReview ? (
        <View style={[styles.pill, { top: pillTop, backgroundColor: '#1C1C1E', flexDirection: 'column', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="shield-search" size={14} color="#FF9F0A" />
            <Text style={[styles.pillText, { color: '#FF9F0A' }]}>Account Under Review</Text>
          </View>
          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93', textAlign: 'center' }}>
            Your account is being reviewed by{'\n'}FlashLocum administrators.
          </Text>
        </View>
      ) : isRejected ? (
        <View style={[styles.pill, { top: pillTop, backgroundColor: '#1C1C1E', flexDirection: 'column', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="close-circle-outline" size={14} color="#FF3B30" />
            <Text style={[styles.pillText, { color: '#FF3B30' }]}>Verification Unsuccessful</Text>
          </View>
          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93', textAlign: 'center' }}>
            Please contact support to resolve this.
          </Text>
        </View>
      ) : isSuspended ? (
        <View style={[styles.pill, { top: pillTop, backgroundColor: '#1C1C1E', flexDirection: 'column', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="account-cancel-outline" size={14} color="#FF3B30" />
            <Text style={[styles.pillText, { color: '#FF3B30' }]}>Account Suspended</Text>
          </View>
          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93', textAlign: 'center' }}>
            Your account has been temporarily suspended.{'\n'}Please contact support for assistance.
          </Text>
        </View>
      ) : (
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
      )}

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

          {/* No session */}
          {!homeCardSession && (
            <View style={styles.subCard}>
              <Text style={styles.subCardLabel}>COVERAGE</Text>
              <Text style={styles.subCardHeading}>No coverage yet</Text>
              <Text style={styles.subCardBody}>
                Stay online to start receiving dispatch requests.
              </Text>
            </View>
          )}

          {/* Payment pending — shift ended, awaiting payment */}
          {showPaymentPending && homeCardSession && (
            <View style={styles.subCard}>
              <HomePaymentPendingContent session={homeCardSession} />
            </View>
          )}

          {/* Upcoming or paused */}
          {showUpcomingOrPaused && homeCardSession && (
            <View style={styles.subCard}>
              <HomeUpcomingContent
                session={homeCardSession}
                onCancel={(s) => handleCancelShift(s)}
                onCall={(s) => handleCallRequester(s)}
              />
            </View>
          )}

          {/* Active session — DoctorActiveCard has its own subCard wrapper */}
          {showActive && homeCardSession && (
            <DoctorActiveCard
              session={homeCardSession}
              onCall={() => handleCallRequester(homeCardSession)}
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
                <Text style={styles.statValue}>{doctorRatingScore !== null ? doctorRatingScore.toFixed(2) : '--'}</Text>
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
              <Text style={styles.statValue}>{doctorReliabilityScore !== null ? `${Math.round(doctorReliabilityScore)}%` : '--'}</Text>
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
            {DOCTOR_CANCEL_REASONS.map((reason) => (
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
  { elementType: 'geometry', stylers: [{ color: '#F0F4F8' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F0F4F8' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#C5D0DC' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E8EFF5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'poi.park', elementType: 'labels.text.stroke', stylers: [{ color: '#F0F4F8' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#E2E6EA' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#D8DDE3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#C8CDD3' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#BCC3CA' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#87CEEB' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#000000' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry.stroke', stylers: [{ color: '#4169E1' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#EDF1F5' }] },
];

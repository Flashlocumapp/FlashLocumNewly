import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
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

const { height: screenHeight } = Dimensions.get('window');
const SHEET_HEIGHT = screenHeight * 0.45;

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

export default function DoctorHomeScreen() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const [isOnline, setIsOnline] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const mapRef = useRef<MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const hasAnimatedToUser = useRef(false);

  // Radar pulse animation
  const radarScale = useRef(new Animated.Value(1)).current;
  const radarOpacity = useRef(new Animated.Value(0.6)).current;



  // GPS setup
  useEffect(() => {
    let active = true;

    async function startWatching() {
      console.log('[DoctorHome] Requesting location permission');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[DoctorHome] Location permission denied');
        return;
      }
      console.log('[DoctorHome] Location permission granted, starting watch');
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 2000,
          distanceInterval: 5,
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

  // Radar pulse loop
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

  return (
    <View style={styles.container}>
      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={LAGOS_REGION}
        showsUserLocation={true}
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
              <MaterialCommunityIcons name="stethoscope" size={32} color="#1C1C1E" />
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
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(52,199,89,0.25)',
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

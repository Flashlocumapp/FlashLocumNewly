import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

export default function DoctorHomeScreen() {
  const insets = useSafeAreaInsets();
  const [isOnline, setIsOnline] = useState(false);

  const statusDotColor = isOnline ? COLORS.success : '#8E8E93';
  const statusText = isOnline ? 'Online' : 'Offline';
  const pillTop = insets.top + 12;

  const handleToggleStatus = () => {
    const next = !isOnline;
    console.log('[DoctorHome] Status toggled:', next ? 'Online' : 'Offline');
    setIsOnline(next);
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        initialRegion={LAGOS_REGION}
        customMapStyle={DESATURATED_MAP_STYLE}
      />

      {/* Online/Offline pill */}
      <TouchableOpacity
        onPress={handleToggleStatus}
        activeOpacity={0.85}
        style={{
          position: 'absolute',
          top: pillTop,
          alignSelf: 'center',
          zIndex: 10,
          backgroundColor: '#FFFFFF',
          borderRadius: RADIUS.full,
          paddingHorizontal: 20,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 4,
        }}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: RADIUS.full,
            backgroundColor: statusDotColor,
          }}
        />
        <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.text }]}>
          {statusText}
        </Text>
      </TouchableOpacity>

      {/* Bottom sheet card */}
      <View
        style={{
          position: 'absolute',
          bottom: 100,
          left: 16,
          right: 16,
          backgroundColor: '#FFFFFF',
          borderRadius: 24,
          padding: SPACING.base,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 20,
          elevation: 6,
        }}
      >
        <Text
          style={[
            TYPOGRAPHY.label,
            { color: COLORS.textTertiary, marginBottom: 4, letterSpacing: 1 },
          ]}
        >
          COVERAGE
        </Text>
        <Text style={[TYPOGRAPHY.h3, { color: COLORS.text, marginBottom: 4 }]}>
          No coverage yet
        </Text>
        <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginBottom: SPACING.base }]}>
          Stay online to start receiving dispatch requests.
        </Text>

        {/* Metric cards row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Ratings card */}
          <View
            style={{
              flex: 1,
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              padding: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <Text style={[TYPOGRAPHY.label, { color: COLORS.textTertiary, letterSpacing: 1 }]}>
                RATINGS
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textTertiary }}>ℹ</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[TYPOGRAPHY.h2, { color: COLORS.text }]}>4.7</Text>
              <Text style={{ fontSize: 18, color: '#F4A261' }}>★</Text>
            </View>
          </View>

          {/* Reliability card */}
          <View
            style={{
              flex: 1,
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              padding: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <Text style={[TYPOGRAPHY.label, { color: COLORS.textTertiary, letterSpacing: 1 }]}>
                RELIABILITY
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textTertiary }}>ℹ</Text>
            </View>
            <Text style={[TYPOGRAPHY.h2, { color: COLORS.text }]}>100%</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

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

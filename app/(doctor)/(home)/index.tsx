import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MapView from 'react-native-maps';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

export default function DoctorHomeScreen() {
  const [isOnline, setIsOnline] = useState(false);

  const statusDotColor = isOnline ? COLORS.success : '#8E8E93';
  const statusText = isOnline ? 'Online' : 'Offline';

  const handleToggleStatus = () => {
    const next = !isOnline;
    console.log('[DoctorHome] Status toggled:', next ? 'Online' : 'Offline');
    setIsOnline(next);
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={LAGOS_REGION}
      />

      {/* Online/Offline pill */}
      <TouchableOpacity
        onPress={handleToggleStatus}
        activeOpacity={0.85}
        style={{
          position: 'absolute',
          top: 60,
          alignSelf: 'center',
          zIndex: 10,
          backgroundColor: '#FFFFFF',
          borderRadius: RADIUS.full,
          paddingHorizontal: 20,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
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
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
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
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
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
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
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

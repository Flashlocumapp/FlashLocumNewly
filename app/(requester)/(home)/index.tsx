import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MapView from 'react-native-maps';
import { Search } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

export default function RequesterHomeScreen() {
  const handleSearchPress = () => {
    console.log('[RequesterHome] Search bar pressed');
  };

  const handleInfoPress = () => {
    console.log('[RequesterHome] Info icon pressed');
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={LAGOS_REGION}
      />

      {/* Stats pill */}
      <View
        style={{
          position: 'absolute',
          top: 60,
          alignSelf: 'center',
          zIndex: 10,
          backgroundColor: '#FFFFFF',
          borderRadius: RADIUS.full,
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        }}
      >
        <Text style={{ fontSize: 14, color: '#F4A261', fontWeight: '600' }}>★</Text>
        <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.text }]}>5.0</Text>
        <Text style={{ color: COLORS.textTertiary, fontSize: 16 }}>|</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: RADIUS.full,
              backgroundColor: COLORS.success,
            }}
          />
          <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.text }]}>100%</Text>
        </View>
        <Text style={{ color: COLORS.textTertiary, fontSize: 16 }}>|</Text>
        <TouchableOpacity onPress={handleInfoPress} activeOpacity={0.7}>
          <Text style={{ fontSize: 14, color: COLORS.textTertiary }}>ℹ</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom sheet card */}
      <View
        style={{
          position: 'absolute',
          bottom: 100,
          left: 16,
          right: 16,
          backgroundColor: '#FFFFFF',
          borderRadius: 24,
          padding: SPACING.lg,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        }}
      >
        {/* Drag handle */}
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: RADIUS.full,
            backgroundColor: '#DEDEDE',
            alignSelf: 'center',
            marginBottom: SPACING.base,
          }}
        />

        {/* Search row */}
        <TouchableOpacity
          onPress={handleSearchPress}
          activeOpacity={0.8}
          style={{
            backgroundColor: '#F2F2F2',
            borderRadius: 16,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Search size={18} color={COLORS.textTertiary} />
          <Text style={[TYPOGRAPHY.body, { color: COLORS.textTertiary }]}>
            Where is coverage needed?
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

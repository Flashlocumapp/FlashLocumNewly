import React from 'react';
import { View, Text } from 'react-native';

// Stub PROVIDER_GOOGLE and Marker for web — MapView is native-only
export const PROVIDER_GOOGLE = null;
export const Marker = (_props: any) => null;

export default function MapView({ style, children }: { style?: any; children?: React.ReactNode }) {
  return (
    <View style={[{ backgroundColor: '#F0EFE9', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#8E8E93', fontSize: 13, fontFamily: 'System' }}>Map preview not available</Text>
    </View>
  );
}

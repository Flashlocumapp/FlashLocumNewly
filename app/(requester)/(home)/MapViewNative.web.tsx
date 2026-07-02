import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const MapView = React.forwardRef((_props: any, _ref: any) => (
  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#F9F9F6', alignItems: 'center', justifyContent: 'center' }]}>
    <Text style={{ color: '#8E8E93', fontSize: 14 }}>Map unavailable in preview</Text>
  </View>
));

export const Marker = () => null;
export const PROVIDER_GOOGLE = undefined;

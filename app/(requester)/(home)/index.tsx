import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function RequesterHomeScreenWeb() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Map view is not available on web.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
    color: '#8E8E93',
  },
});

import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';

const appIcon = require('@/assets/images/APP ICON.png');

export default function IndexScreen() {
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSpinner(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Image source={appIcon} style={styles.icon} resizeMode="contain" />
      <ActivityIndicator
        color="#FFFFFF"
        size="small"
        style={[styles.spinner, { opacity: showSpinner ? 1 : 0 }]}
      />
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111315',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: width * 0.60,
    height: width * 0.60,
  },
  spinner: {
    marginTop: 32,
  },
});

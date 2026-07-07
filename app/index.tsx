import React from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { NotificationBell } from "@/components/NotificationBell";

SplashScreen.preventAutoHideAsync();

const appIcon = require('@/assets/images/APP ICON.png');

export default function IndexScreen() {
  return (
    <View style={styles.container}>
            <NotificationBell />
      
<Image source={appIcon} style={styles.icon} resizeMode="contain" />
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
});

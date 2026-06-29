import React, { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

const appIcon = require('@/assets/images/b1d2e6b2-10a6-4a7c-81fe-d98e0f2dec61.png');

export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      await SplashScreen.hideAsync();
      if (data.session) {
        router.replace('/(app)/(home)');
      } else {
        router.replace('/(auth)/intro');
      }
    };
    run();
  }, []);

  return (
    <View style={styles.container}>
      <Image source={appIcon} style={styles.icon} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111315',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 120,
    height: 120,
  },
});

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  StyleSheet,
  ScrollView,
  AppState,
  AppStateStatus,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useNotifications } from '@/contexts/NotificationContext';

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function CardDivider() {
  return <View style={styles.cardDivider} />;
}

export default function RequesterAccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hasPermission, permissionDenied, requestPermission } = useNotifications();

  const [locationGranted, setLocationGranted] = useState(false);
  const [locationCanAskAgain, setLocationCanAskAgain] = useState(true);
  const appStateRef = useRef(AppState.currentState);

  const refreshLocationPermission = useCallback(async () => {
    try {
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      setLocationGranted(status === 'granted');
      setLocationCanAskAgain(canAskAgain);
    } catch {}
  }, []);

  // Read location permission on mount
  useEffect(() => {
    refreshLocationPermission();
  }, [refreshLocationPermission]);

  // Re-check location permission when screen comes back into focus (e.g. returning from OS Settings)
  useFocusEffect(
    useCallback(() => {
      refreshLocationPermission();
    }, [refreshLocationPermission])
  );

  // Re-check location permission when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        refreshLocationPermission();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [refreshLocationPermission]);

  const handlePushToggle = async (value: boolean) => {
    console.log('[Requester Account Settings] Push notifications toggle:', value);
    if (value) {
      if (permissionDenied) {
        // Previously denied — must go to OS Settings
        console.log('[Requester Account Settings] Push permission denied, opening OS Settings');
        if (Platform.OS === 'ios') {
          Linking.openURL('app-settings:');
        } else {
          Linking.openSettings();
        }
      } else {
        console.log('[Requester Account Settings] Requesting push permission');
        await requestPermission();
      }
    } else {
      // Cannot programmatically revoke — send to OS Settings
      console.log('[Requester Account Settings] Cannot revoke push permission programmatically, opening OS Settings');
      if (Platform.OS === 'ios') {
        Linking.openURL('app-settings:');
      } else {
        Linking.openSettings();
      }
    }
  };

  const handleLocationToggle = async (value: boolean) => {
    console.log('[Requester Account Settings] Location toggle:', value);
    if (value) {
      if (!locationCanAskAgain) {
        // Permanently denied — must go to OS Settings
        console.log('[Requester Account Settings] Location permanently denied, opening OS Settings');
        Linking.openSettings();
      } else {
        console.log('[Requester Account Settings] Requesting location permission');
        const result = await Location.requestForegroundPermissionsAsync();
        setLocationGranted(result.status === 'granted');
        setLocationCanAskAgain(result.canAskAgain ?? true);
      }
    } else {
      // Cannot programmatically revoke — send to OS Settings
      console.log('[Requester Account Settings] Cannot revoke location permission programmatically, opening OS Settings');
      Linking.openSettings();
    }
  };

  return (
    <>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            console.log('[Requester Account Settings] Back pressed');
            router.back();
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* COMMUNICATION */}
        <Text style={styles.sectionHeader}>COMMUNICATION</Text>
        <Card>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextGroup}>
              <Text style={styles.rowLabel}>Push Notifications</Text>
              <Text style={styles.rowSubLabel}>Shift requests, updates and important alerts</Text>
            </View>
            <Switch
              value={hasPermission}
              onValueChange={handlePushToggle}
              trackColor={{ false: '#E5E5EA', true: '#34C759' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        {/* LOCATION */}
        <Text style={styles.sectionHeader}>LOCATION</Text>
        <Card>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextGroup}>
              <Text style={styles.rowLabel}>Location Access</Text>
              <Text style={styles.rowSubLabel}>Used to provide relevant coverage and location-based experiences</Text>
            </View>
            <Switch
              value={locationGranted}
              onValueChange={handleLocationToggle}
              trackColor={{ false: '#E5E5EA', true: '#34C759' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        {/* PRIVACY */}
        <Text style={styles.sectionHeader}>PRIVACY</Text>
        <Card>
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => {
              console.log('[Requester Account Settings] Navigate to Personal Data');
              router.push('/(requester)/(account)/personal-data' as any);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.rowTextGroup}>
              <Text style={styles.rowLabel}>Your Personal Data</Text>
              <Text style={styles.rowSubLabel}>Manage your information and account data</Text>
            </View>
            <ChevronRight size={16} color="#8E8E93" />
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F5' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  header: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  backButton: { width: 32, alignItems: 'flex-start' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  headerSpacer: { width: 32 },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: '#8E8E93', letterSpacing: 1, marginBottom: 8, marginTop: 24, marginLeft: 4 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' },
  cardDivider: { height: 1, backgroundColor: '#E5E5EA', marginLeft: 16 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  toggleTextGroup: { flex: 1, marginRight: 12 },
  rowTextGroup: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 15, color: '#1C1C1E', fontWeight: '500' },
  rowSubLabel: { fontSize: 12, color: '#8E8E93', marginTop: 2, lineHeight: 16 },
});

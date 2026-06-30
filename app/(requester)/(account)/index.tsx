import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, LogOut, ArrowLeftRight } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { TAB_BAR_HEIGHT } from '../_layout';

export default function RequesterAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const userEmail = user?.email ?? '';

  const handleSignOut = async () => {
    console.log('[RequesterAccount] Sign out pressed');
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          console.log('[RequesterAccount] Confirming sign out');
          await supabase.auth.signOut();
          router.replace('/(auth)/role-select' as any);
        },
      },
    ]);
  };

  const handleSwitchPathway = () => {
    console.log('[RequesterAccount] Switch pathway pressed');
    router.push('/(app)/(home)' as any);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F7F7F5' }}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: SPACING.base,
        paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[TYPOGRAPHY.h1, { color: COLORS.text, marginBottom: 4 }]}>
        Account
      </Text>
      <Text
        style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginBottom: SPACING.xl }]}
        selectable
      >
        {userEmail}
      </Text>

      {/* Actions */}
      <View style={{ gap: SPACING.sm }}>
        {/* Switch pathway */}
        <TouchableOpacity
          onPress={handleSwitchPathway}
          activeOpacity={0.8}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: RADIUS.xl,
            padding: SPACING.base,
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING.base,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: RADIUS.md,
              backgroundColor: COLORS.primaryMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeftRight size={20} color={COLORS.primary} />
          </View>
          <Text style={[TYPOGRAPHY.bodyMedium, { flex: 1, color: COLORS.text }]}>
            Switch pathway
          </Text>
          <ChevronRight size={18} color={COLORS.textTertiary} />
        </TouchableOpacity>

        {/* Sign out */}
        <TouchableOpacity
          onPress={handleSignOut}
          activeOpacity={0.8}
          style={{
            backgroundColor: COLORS.text,
            borderRadius: RADIUS.full,
            padding: SPACING.base,
            alignItems: 'center',
            marginTop: SPACING.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <LogOut size={18} color={COLORS.textInverse} />
            <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.textInverse }]}>
              Sign out
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

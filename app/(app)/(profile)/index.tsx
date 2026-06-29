import React from 'react';
import {
  View,
  Text,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import {
  User,
  Mail,
  ShieldCheck,
  Settings,
  ChevronRight,
  LogOut,
  Bell,
  Lock,
  HelpCircle,
} from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { useState } from 'react';

interface ProfileRowProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  isDark: boolean;
  destructive?: boolean;
}

function ProfileRow({ icon, label, onPress, isDark, destructive }: ProfileRowProps) {
  const surface = isDark ? COLORS.dark.surface : COLORS.surface;
  const textColor = isDark ? COLORS.dark.text : COLORS.text;
  const textTertiary = isDark ? COLORS.dark.textTertiary : COLORS.textTertiary;

  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        backgroundColor: surface,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.base,
        paddingVertical: SPACING.base,
        gap: SPACING.base,
      }}
    >
      <View style={{ width: 32, alignItems: 'center' }}>{icon}</View>
      <Text
        style={[
          TYPOGRAPHY.body,
          { flex: 1, color: destructive ? COLORS.danger : textColor },
        ]}
      >
        {label}
      </Text>
      {!destructive && <ChevronRight size={16} color={textTertiary} />}
    </AnimatedPressable>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [signingOut, setSigningOut] = useState(false);

  const bg = isDark ? COLORS.dark.background : COLORS.background;
  const surface = isDark ? COLORS.dark.surface : COLORS.surface;
  const textColor = isDark ? COLORS.dark.text : COLORS.text;
  const textSecondary = isDark ? COLORS.dark.textSecondary : COLORS.textSecondary;
  const borderColor = isDark ? COLORS.dark.border : COLORS.border;
  const divider = isDark ? COLORS.dark.divider : COLORS.divider;

  const userEmail = user?.email ?? '';
  const displayName = userEmail.split('@')[0] ?? 'User';

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
  };

  const handleAccountPress = () => {};

  const handleVerificationPress = () => {};

  const handleNotificationsPress = () => {};

  const handleSecurityPress = () => {};

  const handleHelpPress = () => {};

  const iconColor = isDark ? COLORS.dark.textSecondary : COLORS.textSecondary;

  return (
    <>
      <Stack.Screen options={{ title: 'Profile' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{
          paddingBottom: SPACING.xxxl + SPACING.xl,
          gap: SPACING.base,
        }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + name */}
        <View
          style={{
            alignItems: 'center',
            paddingVertical: SPACING.xl,
            paddingHorizontal: SPACING.base,
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: RADIUS.full,
              backgroundColor: COLORS.primary,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: SPACING.base,
              boxShadow: '0 4px 16px rgba(0, 102, 204, 0.25)',
            }}
          >
            <Text style={{ fontSize: 32, color: COLORS.textInverse, fontWeight: '700' }}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[TYPOGRAPHY.h3, { color: textColor, marginBottom: SPACING.xs }]}>
            {displayName}
          </Text>
          <Text style={[TYPOGRAPHY.caption, { color: textSecondary }]}>
            {userEmail}
          </Text>
        </View>

        {/* Account section */}
        <View style={{ paddingHorizontal: SPACING.base }}>
          <Text
            style={[
              TYPOGRAPHY.label,
              { color: textSecondary, marginBottom: SPACING.sm, marginLeft: SPACING.xs },
            ]}
          >
            ACCOUNT
          </Text>
          <View
            style={{
              backgroundColor: surface,
              borderRadius: RADIUS.xl,
              borderWidth: 1,
              borderColor,
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0, 102, 204, 0.06)',
            }}
          >
            <ProfileRow
              icon={<User size={20} color={COLORS.primary} />}
              label="Personal information"
              onPress={handleAccountPress}
              isDark={isDark}
            />
            <View style={{ height: 1, backgroundColor: divider, marginLeft: 48 + SPACING.base }} />
            <ProfileRow
              icon={<Mail size={20} color={COLORS.primary} />}
              label="Email address"
              onPress={handleAccountPress}
              isDark={isDark}
            />
          </View>
        </View>

        {/* Verification section */}
        <View style={{ paddingHorizontal: SPACING.base }}>
          <Text
            style={[
              TYPOGRAPHY.label,
              { color: textSecondary, marginBottom: SPACING.sm, marginLeft: SPACING.xs },
            ]}
          >
            VERIFICATION
          </Text>
          <View
            style={{
              backgroundColor: surface,
              borderRadius: RADIUS.xl,
              borderWidth: 1,
              borderColor,
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0, 102, 204, 0.06)',
            }}
          >
            <ProfileRow
              icon={<ShieldCheck size={20} color={COLORS.accent} />}
              label="Professional credentials"
              onPress={handleVerificationPress}
              isDark={isDark}
            />
          </View>
        </View>

        {/* Settings section */}
        <View style={{ paddingHorizontal: SPACING.base }}>
          <Text
            style={[
              TYPOGRAPHY.label,
              { color: textSecondary, marginBottom: SPACING.sm, marginLeft: SPACING.xs },
            ]}
          >
            SETTINGS
          </Text>
          <View
            style={{
              backgroundColor: surface,
              borderRadius: RADIUS.xl,
              borderWidth: 1,
              borderColor,
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0, 102, 204, 0.06)',
            }}
          >
            <ProfileRow
              icon={<Bell size={20} color={iconColor} />}
              label="Notifications"
              onPress={handleNotificationsPress}
              isDark={isDark}
            />
            <View style={{ height: 1, backgroundColor: divider, marginLeft: 48 + SPACING.base }} />
            <ProfileRow
              icon={<Lock size={20} color={iconColor} />}
              label="Security"
              onPress={handleSecurityPress}
              isDark={isDark}
            />
            <View style={{ height: 1, backgroundColor: divider, marginLeft: 48 + SPACING.base }} />
            <ProfileRow
              icon={<HelpCircle size={20} color={iconColor} />}
              label="Help & support"
              onPress={handleHelpPress}
              isDark={isDark}
            />
          </View>
        </View>

        {/* Sign out */}
        <View style={{ paddingHorizontal: SPACING.base }}>
          <AnimatedPressable
            onPress={handleSignOut}
            disabled={signingOut}
            style={{
              backgroundColor: COLORS.dangerMuted,
              borderRadius: RADIUS.xl,
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: SPACING.sm,
              borderWidth: 1,
              borderColor: 'rgba(230, 57, 70, 0.20)',
            }}
          >
            {signingOut ? (
              <ActivityIndicator color={COLORS.danger} />
            ) : (
              <>
                <LogOut size={18} color={COLORS.danger} />
                <Text style={[TYPOGRAPHY.bodySemibold, { color: COLORS.danger }]}>
                  Sign out
                </Text>
              </>
            )}
          </AnimatedPressable>
        </View>
      </ScrollView>
    </>
  );
}

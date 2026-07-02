import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';

interface RequesterProfile {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  gender: string | null;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader}>{title}</Text>
  );
}

function CardRow({
  label,
  value,
  onPress,
  showChevron,
  labelRed,
  chevronRed,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  labelRed?: boolean;
  chevronRed?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={styles.cardRow}
    >
      <Text style={[styles.rowLabel, labelRed && styles.rowLabelRed]}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {showChevron && (
          <ChevronRight size={16} color={chevronRed ? '#E63946' : '#8E8E93'} style={{ marginLeft: 4 }} />
        )}
      </View>
    </TouchableOpacity>
  );
}

function CardDivider() {
  return <View style={styles.cardDivider} />;
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export default function RequesterAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [profile, setProfile] = useState<RequesterProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      console.log('[RequesterAccount] Fetching profile for user:', user.id);
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone, gender')
        .eq('id', user.id)
        .single();
      if (error) {
        console.log('[RequesterAccount] Profile fetch error:', error.message);
      } else {
        console.log('[RequesterAccount] Profile fetched successfully');
        setProfile(data as RequesterProfile);
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const firstName = profile?.first_name ?? '';
  const lastName = profile?.last_name ?? '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || '—';
  const initials = [firstName[0], lastName[0]].filter(Boolean).join('').toUpperCase() || '?';
  const userEmail = user?.email ?? '';

  const phoneValue = profile?.phone ?? '—';
  const rawGender = profile?.gender ?? '';
  const genderValue = rawGender ? rawGender.charAt(0).toUpperCase() + rawGender.slice(1) : '—';

  const handleHelpCenter = () => {
    console.log('[RequesterAccount] Help Center pressed');
    Alert.alert('Help Center', 'Coming soon.');
  };

  const handleSupportCenter = () => {
    console.log('[RequesterAccount] Support Center pressed');
    Alert.alert('Support Center', 'Coming soon.');
  };

  const handleSwitchPathway = () => {
    console.log('[RequesterAccount] Switch to Cover & Earn pressed');
    router.push('/(app)/(home)' as any);
  };

  const handleSignOut = () => {
    console.log('[RequesterAccount] Sign out pressed');
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          console.log('[RequesterAccount] Confirming sign out');
          await supabase.auth.signOut();
          router.replace('/(auth)/role-select' as any);
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    console.log('[RequesterAccount] Delete Account pressed');
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => Alert.alert('Coming Soon', 'Account deletion will be available soon.'),
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1C1C1E" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + 24, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Avatar + Name */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
        <Text style={styles.displayName}>{fullName}</Text>
        <Text style={styles.emailText}>{userEmail}</Text>
      </View>

      {/* Section 1 — PROFILE */}
      <SectionHeader title="PROFILE" />
      <Card>
        <CardRow label="Phone Number" value={phoneValue} />
        <CardDivider />
        <CardRow label="Gender" value={genderValue} />
      </Card>

      {/* Section 2 — SUPPORT */}
      <SectionHeader title="SUPPORT" />
      <Card>
        <CardRow label="Help Center" showChevron onPress={handleHelpCenter} />
        <CardDivider />
        <CardRow label="Support Center" showChevron onPress={handleSupportCenter} />
      </Card>

      {/* Section 3 — ACCOUNT MANAGEMENT */}
      <SectionHeader title="ACCOUNT MANAGEMENT" />
      <Card>
        <CardRow label="Switch to Cover & Earn" showChevron onPress={handleSwitchPathway} />
        <CardDivider />
        <CardRow label="Sign Out" showChevron onPress={handleSignOut} />
      </Card>

      {/* Section 4 — DANGER ZONE */}
      <SectionHeader title="DANGER ZONE" />
      <Card>
        <CardRow
          label="Delete Account"
          labelRed
          showChevron
          chevronRed
          onPress={handleDeleteAccount}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F6',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F9F9F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  emailText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 20,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#2C2C2E',
    marginLeft: 16,
  },
  rowLabel: {
    fontSize: 14,
    color: '#8E8E93',
    flex: 1,
  },
  rowLabelRed: {
    color: '#E63946',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '60%',
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'right',
  },
});

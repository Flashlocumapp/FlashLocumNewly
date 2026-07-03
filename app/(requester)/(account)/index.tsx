import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
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
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function CardDivider() {
  return <View style={styles.cardDivider} />;
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function EditableRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.cardRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.editablePill}>
        <Text style={styles.editablePillText}>{value}</Text>
        <ChevronRight size={14} color="#FFFFFF" style={{ marginLeft: 2 }} />
      </View>
    </TouchableOpacity>
  );
}

function ActionRow({ label, onPress, labelRed, chevronRed }: { label: string; onPress: () => void; labelRed?: boolean; chevronRed?: boolean }) {
  return (
    <TouchableOpacity style={styles.cardRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.rowLabel, labelRed && styles.rowLabelRed]}>{label}</Text>
      <ChevronRight size={16} color={chevronRed ? '#E63946' : '#8E8E93'} />
    </TouchableOpacity>
  );
}

export default function RequesterAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profile: authProfile } = useAuth();

  const [profile, setProfile] = useState<RequesterProfile | null>(() => {
    if (!authProfile) return null;
    return {
      first_name: authProfile.first_name ?? null,
      last_name: authProfile.last_name ?? null,
      phone: authProfile.phone ?? null,
      gender: authProfile.gender ?? null,
    };
  });
  const [loading, setLoading] = useState(true);

  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [savingGender, setSavingGender] = useState(false);

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
      }
      setProfile({
        first_name: authProfile?.first_name ?? data?.first_name ?? null,
        last_name: authProfile?.last_name ?? data?.last_name ?? null,
        phone: authProfile?.phone ?? data?.phone ?? null,
        gender: authProfile?.gender ?? data?.gender ?? null,
      });
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const firstName = profile?.first_name ?? '';
  const lastName = profile?.last_name ?? '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
    || (user?.user_metadata?.full_name as string | undefined)?.trim()
    || '—';
  const initials = fullName !== '—'
    ? fullName.trim().split(' ').map((n: string) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2)
    : '?';
  const userEmail = user?.email ?? '';
  const phoneValue = profile?.phone ?? '—';
  const rawGender = profile?.gender ?? '';
  const genderValue = rawGender ? rawGender.charAt(0).toUpperCase() + rawGender.slice(1) : '—';

  const openPhoneModal = () => {
    console.log('[RequesterAccount] Phone Number edit pressed');
    setEditPhone(profile?.phone ?? '');
    setPhoneError('');
    setPhoneModalVisible(true);
  };

  const handleSavePhone = async () => {
    const cleaned = editPhone.replace(/\s/g, '');
    if (!/^0\d{10}$/.test(cleaned)) {
      setPhoneError('Enter a valid Nigerian number (e.g. 08012345678)');
      return;
    }
    setSavingPhone(true);
    console.log('[RequesterAccount] Saving phone number');
    const { error } = await supabase.from('profiles').update({ phone: cleaned }).eq('id', user!.id);
    setSavingPhone(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setProfile((prev) => prev ? { ...prev, phone: cleaned } : prev);
    setPhoneModalVisible(false);
  };

  const handleSaveGender = async (newGender: 'male' | 'female') => {
    setSavingGender(true);
    console.log('[RequesterAccount] Saving gender:', newGender);
    const { error } = await supabase.from('profiles').update({ gender: newGender }).eq('id', user!.id);
    setSavingGender(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setProfile((prev) => prev ? { ...prev, gender: newGender } : prev);
    setGenderModalVisible(false);
  };

  const handleSignOut = () => {
    console.log('[RequesterAccount] Sign out pressed');
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
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
    Alert.alert('Delete Account', 'This action is permanent and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Coming Soon', 'Account deletion will be available soon.') },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <Text style={styles.displayName}>{fullName}</Text>
          <Text style={styles.emailText}>{userEmail}</Text>
        </View>

        <SectionHeader title="PROFILE" />
        <Card>
          <EditableRow label="Phone Number" value={phoneValue} onPress={openPhoneModal} />
          <CardDivider />
          <EditableRow label="Gender" value={genderValue} onPress={() => { console.log('[RequesterAccount] Gender edit pressed'); setGenderModalVisible(true); }} />
        </Card>

        <SectionHeader title="SUPPORT" />
        <Card>
          <ActionRow label="Help Center" onPress={() => { console.log('[RequesterAccount] Help Center pressed'); Alert.alert('Help Center', 'Coming soon.'); }} />
          <CardDivider />
          <ActionRow label="Support Center" onPress={() => { console.log('[RequesterAccount] Support Center pressed'); Alert.alert('Support Center', 'Coming soon.'); }} />
        </Card>

        <SectionHeader title="ACCOUNT MANAGEMENT" />
        <Card>
          <ActionRow label="Switch to Cover & Earn" onPress={() => {
            console.log('[RequesterAccount] Switch to Cover & Earn pressed');
            if (authProfile?.doctor_onboarding_complete) {
              router.replace('/(doctor)/(home)' as any);
            } else {
              router.replace('/(onboarding)/doctor/basic-profile' as any);
            }
          }} />
          <CardDivider />
          <ActionRow label="Sign Out" onPress={handleSignOut} />
        </Card>

        <SectionHeader title="DANGER ZONE" />
        <Card>
          <ActionRow label="Delete Account" onPress={handleDeleteAccount} labelRed chevronRed />
        </Card>
      </ScrollView>

      {/* Phone Edit Modal */}
      <Modal visible={phoneModalVisible} transparent animationType="slide" onRequestClose={() => setPhoneModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPhoneModalVisible(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Edit Phone Number</Text>
            <TextInput
              style={[styles.modalInput, phoneError ? styles.modalInputError : null]}
              value={editPhone}
              onChangeText={(t) => { setEditPhone(t); setPhoneError(''); }}
              keyboardType="phone-pad"
              maxLength={11}
              placeholder="080XXXXXXXX"
              placeholderTextColor="#ADADAD"
              autoFocus
            />
            {!!phoneError && <Text style={styles.modalError}>{phoneError}</Text>}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setPhoneModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSavePhone} disabled={savingPhone}>
                {savingPhone ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Gender Edit Modal */}
      <Modal visible={genderModalVisible} transparent animationType="slide" onRequestClose={() => setGenderModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setGenderModalVisible(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Edit Gender</Text>
            <TouchableOpacity style={styles.genderOption} onPress={() => handleSaveGender('male')} disabled={savingGender}>
              <Text style={[styles.genderOptionText, profile?.gender === 'male' && styles.genderOptionSelected]}>Male</Text>
            </TouchableOpacity>
            <View style={styles.modalDivider} />
            <TouchableOpacity style={styles.genderOption} onPress={() => handleSaveGender('female')} disabled={savingGender}>
              <Text style={[styles.genderOptionText, profile?.gender === 'female' && styles.genderOptionSelected]}>Female</Text>
            </TouchableOpacity>
            {savingGender && <ActivityIndicator style={{ marginTop: 12 }} color="#1C1C1E" />}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1C1C1E' },
  scrollContent: { paddingHorizontal: 16 },
  loadingContainer: { flex: 1, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' },
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F9F9F6', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarInitials: { fontSize: 28, fontWeight: '700', color: '#1C1C1E' },
  displayName: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  emailText: { fontSize: 14, color: '#8E8E93' },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: '#8E8E93', letterSpacing: 1, marginBottom: 8, marginTop: 24, marginLeft: 4 },
  card: { backgroundColor: '#F9F9F6', borderRadius: 16, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  cardDivider: { height: 1, backgroundColor: '#E5E5E5', marginLeft: 16 },
  rowLabel: { fontSize: 14, color: '#6B6B6B', flex: 1 },
  rowLabelRed: { color: '#E63946' },
  editablePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  editablePillText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#F9F9F6', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', textAlign: 'center', marginBottom: 20 },
  modalInput: { backgroundColor: '#EFEFEF', borderRadius: 28, paddingHorizontal: 18, paddingVertical: 16, fontSize: 16, color: '#0A0A0A', marginBottom: 8 },
  modalInputError: { borderWidth: 1, borderColor: '#EF4444' },
  modalError: { fontSize: 12, color: '#EF4444', marginBottom: 8, marginLeft: 4 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: { flex: 1, backgroundColor: '#EFEFEF', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  modalSaveBtn: { flex: 1, backgroundColor: '#1C1C1E', borderRadius: 28, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  genderOption: { paddingVertical: 18, alignItems: 'center' },
  genderOptionText: { fontSize: 17, color: '#1C1C1E', fontWeight: '400' },
  genderOptionSelected: { fontWeight: '700' },
  modalDivider: { height: 1, backgroundColor: '#E0E0E0' },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';

interface DoctorProfile {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  gender: string | null;
  verification_status: string | null;
  mdcn_number: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  selfie_url: string | null;
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

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cardRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
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

export default function DoctorAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profile: authProfile } = useAuth();

  const [profile, setProfile] = useState<DoctorProfile | null>(() => {
    if (!authProfile) return null;
    return {
      first_name: authProfile.first_name ?? null,
      last_name: authProfile.last_name ?? null,
      phone: authProfile.phone ?? null,
      gender: authProfile.gender ?? null,
      verification_status: null,
      mdcn_number: null,
      bank_name: null,
      account_number: null,
      account_name: null,
      selfie_url: null,
    };
  });
  const [loading, setLoading] = useState(true);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);

  // Phone edit modal
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  // Gender edit modal
  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [savingGender, setSavingGender] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      console.log('[DoctorAccount] Fetching profile for user:', user.id);
      const [profileRes, doctorProfileRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('first_name, last_name, phone, gender, verification_status')
          .eq('id', user.id)
          .single(),
        supabase
          .from('doctor_profiles')
          .select('mdcn_number, bank_name, account_number, account_name, selfie_url')
          .eq('id', user.id)
          .single(),
      ]);
      if (profileRes.error) console.log('[DoctorAccount] Profile fetch error:', profileRes.error.message);
      if (doctorProfileRes.error) console.log('[DoctorAccount] DoctorProfile fetch error:', doctorProfileRes.error.message);
      setProfile({
        first_name: authProfile?.first_name ?? profileRes.data?.first_name ?? null,
        last_name: authProfile?.last_name ?? profileRes.data?.last_name ?? null,
        phone: authProfile?.phone ?? profileRes.data?.phone ?? null,
        gender: authProfile?.gender ?? profileRes.data?.gender ?? null,
        verification_status: profileRes.data?.verification_status ?? null,
        mdcn_number: doctorProfileRes.data?.mdcn_number ?? null,
        bank_name: doctorProfileRes.data?.bank_name ?? null,
        account_number: doctorProfileRes.data?.account_number ?? null,
        account_name: doctorProfileRes.data?.account_name ?? null,
        selfie_url: doctorProfileRes.data?.selfie_url ?? null,
      });
      const rawSelfieUrl = doctorProfileRes.data?.selfie_url ?? null;
      if (rawSelfieUrl) {
        const { data: signedData } = await supabase.storage
          .from('doctor-documents')
          .createSignedUrl(rawSelfieUrl, 3600);
        if (signedData?.signedUrl) setSelfieUrl(signedData.signedUrl);
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const firstName = profile?.first_name ?? '';
  const lastName = profile?.last_name ?? '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
    || (user?.user_metadata?.full_name as string | undefined)?.trim()
    || '—';
  const cleanedName = fullName !== '—' ? fullName.replace(/^dr\.?\s*/i, '').trim() : '';
  const displayName = cleanedName ? `Dr. ${cleanedName}` : 'Dr. —';
  const initials = fullName !== '—'
    ? fullName.trim().split(' ').map((n: string) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2)
    : '?';
  const userEmail = user?.email ?? '';

  const phoneValue = profile?.phone ?? '—';
  const mdcnValue = profile?.mdcn_number ?? '—';
  const rawGender = profile?.gender ?? '';
  const genderValue = rawGender ? rawGender.charAt(0).toUpperCase() + rawGender.slice(1) : '—';
  const isVerified = profile?.verification_status === 'verified';
  const bankName = profile?.bank_name ?? '—';
  const accountNumber = profile?.account_number ?? '—';
  const accountName = profile?.account_name ?? '—';

  // ── Phone edit ──
  const openPhoneModal = () => {
    console.log('[DoctorAccount] Phone Number edit pressed');
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
    console.log('[DoctorAccount] Saving phone number');
    const { error } = await supabase.from('profiles').update({ phone: cleaned }).eq('id', user!.id);
    setSavingPhone(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setProfile((prev) => prev ? { ...prev, phone: cleaned } : prev);
    setPhoneModalVisible(false);
  };

  // ── Gender edit ──
  const handleSaveGender = async (newGender: 'male' | 'female') => {
    setSavingGender(true);
    console.log('[DoctorAccount] Saving gender:', newGender);
    const { error } = await supabase.from('profiles').update({ gender: newGender }).eq('id', user!.id);
    setSavingGender(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setProfile((prev) => prev ? { ...prev, gender: newGender } : prev);
    setGenderModalVisible(false);
  };

  const handleSignOut = () => {
    console.log('[DoctorAccount] Sign out pressed');
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          console.log('[DoctorAccount] Confirming sign out');
          await supabase.auth.signOut();
          router.replace('/(auth)/role-select' as any);
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    console.log('[DoctorAccount] Delete Account pressed');
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
        {/* Avatar + Name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            {selfieUrl ? (
              <Image
                source={{ uri: selfieUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.avatarInitials}>{initials}</Text>
            )}
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.emailText}>{userEmail}</Text>
        </View>

        {/* Section 1 — PROFILE & VERIFICATION */}
        <SectionHeader title="PROFILE & VERIFICATION" />
        <Card>
          <EditableRow label="Phone Number" value={phoneValue} onPress={openPhoneModal} />
          <CardDivider />
          <ReadOnlyRow label="MDCN Number" value={mdcnValue} />
          <CardDivider />
          <EditableRow label="Gender" value={genderValue} onPress={() => { console.log('[DoctorAccount] Gender edit pressed'); setGenderModalVisible(true); }} />
          <CardDivider />
          <View style={styles.cardRow}>
            <Text style={styles.rowLabel}>Verification Status</Text>
            {isVerified ? (
              <View style={styles.verifiedBadge}><Text style={styles.verifiedText}>✓ Verified</Text></View>
            ) : (
              <View style={styles.pendingBadge}><Text style={styles.pendingText}>Pending</Text></View>
            )}
          </View>
        </Card>

        {/* Section 2 — FINANCIALS */}
        <SectionHeader title="FINANCIALS" />
        <Card>
          <ReadOnlyRow label="Bank Name" value={bankName} />
          <CardDivider />
          <ReadOnlyRow label="Account Number" value={accountNumber} />
          <CardDivider />
          <ReadOnlyRow label="Account Name" value={accountName} />
        </Card>

        {/* Section 3 — SUPPORT */}
        <SectionHeader title="SUPPORT" />
        <Card>
          <ActionRow label="Help Center" onPress={() => { console.log('[DoctorAccount] Help Center pressed'); router.push('/(doctor)/(account)/help-center' as any); }} />
          <CardDivider />
          <ActionRow label="Contact Support" onPress={() => { console.log('[DoctorAccount] Contact Support pressed'); router.push('/(doctor)/(account)/contact-support' as any); }} />
        </Card>

        {/* Section 4 — ACCOUNT MANAGEMENT */}
        <SectionHeader title="ACCOUNT MANAGEMENT" />
        <Card>
          <ActionRow label="Switch to Request Coverage" onPress={() => {
            console.log('[DoctorAccount] Switch to Request Coverage pressed');
            if (authProfile?.requester_onboarding_complete) {
              router.replace('/(requester)/(home)' as any);
            } else {
              router.push('/(onboarding)/requester/basic-profile' as any);
            }
          }} />
          <CardDivider />
          <ActionRow label="Sign Out" onPress={handleSignOut} />
        </Card>

        {/* Section 5 — DANGER ZONE */}
        <SectionHeader title="DANGER ZONE" />
        <Card>
          <ActionRow label="Delete Account" onPress={handleDeleteAccount} labelRed chevronRed />
        </Card>
      </ScrollView>

      {/* Phone Edit Modal */}
      <Modal visible={phoneModalVisible} transparent animationType="slide" onRequestClose={() => setPhoneModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
        </KeyboardAvoidingView>
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
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarInitials: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' },
  displayName: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  emailText: { fontSize: 14, color: '#8E8E93' },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: '#8E8E93', letterSpacing: 1, marginBottom: 8, marginTop: 24, marginLeft: 4 },
  card: { backgroundColor: '#F9F9F6', borderRadius: 16, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  cardDivider: { height: 1, backgroundColor: '#E5E5E5', marginLeft: 16 },
  rowLabel: { fontSize: 14, color: '#6B6B6B', flex: 1 },
  rowLabelRed: { color: '#E63946' },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', textAlign: 'right', maxWidth: '55%' },
  editablePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  editablePillText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  verifiedBadge: { backgroundColor: '#1A3A2A', borderColor: '#34C759', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedText: { fontSize: 13, color: '#34C759', fontWeight: '600' },
  pendingBadge: { backgroundColor: '#3A2A1A', borderColor: '#F4A261', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pendingText: { fontSize: 13, color: '#F4A261', fontWeight: '600' },
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
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
});

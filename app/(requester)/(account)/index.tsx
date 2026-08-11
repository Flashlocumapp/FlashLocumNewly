import React, { useState, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { SUPABASE_URL } from '@/constants/api';
import { TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';
import { getCached, setCached, invalidate } from '@/utils/tabCache';
import SignOutModal from '@/components/SignOutModal';
import { logIncident } from '@/utils/errorLogger';

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SELFIE_URL_TTL_MS = 50 * 60 * 1000;   // 50 minutes (signed URLs expire at 60)

interface RequesterProfile {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  gender: string | null;
  rating: number | null;
  reliability: number | null;
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

  const profileCacheKey = user ? `requester_profile_${user.id}` : 'requester_profile';

  const [profile, setProfile] = useState<RequesterProfile | null>(() => {
    const cached = getCached<RequesterProfile>(user ? `requester_profile_${user.id}` : 'requester_profile');
    if (cached) return cached;
    if (!authProfile) return null;
    return {
      first_name: authProfile.first_name ?? null,
      last_name: authProfile.last_name ?? null,
      phone: authProfile.phone ?? null,
      gender: authProfile.gender ?? null,
      rating: null,
      reliability: null,
    };
  });
  // Only block render if we have no cache and no seed data at all
  const [loading, setLoading] = useState(getCached(user ? `requester_profile_${user.id}` : 'requester_profile') === null && profile === null);

  const lastFetchedAtRef = useRef<number>(0);
  const switchingPortalRef = useRef(false);

  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [savingGender, setSavingGender] = useState(false);

  const [showSignOutModal, setShowSignOutModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      const now = Date.now();
      const isFresh = (now - lastFetchedAtRef.current) < PROFILE_CACHE_TTL_MS;
      // Skip fetch if cache is fresh — render existing data silently
      if (isFresh && getCached(profileCacheKey)) return;

      const fetchProfile = async () => {
        try {
          const [profileRes, requesterProfileRes] = await Promise.all([
            supabase
              .from('profiles')
              .select('first_name, last_name, phone, gender')
              .eq('id', user.id)
              .single(),
            supabase
              .from('requester_profiles')
              .select('rating, reliability')
              .eq('id', user.id)
              .single(),
          ]);

          if (profileRes.error) {
            console.warn('[RequesterAccount] Background fetch failed:', profileRes.error.message);
            return; // leave existing UI untouched
          }

          const data = profileRes.data;
          const repData = requesterProfileRes.data;

          const mergedProfile: RequesterProfile = {
            first_name: authProfile?.first_name ?? data?.first_name ?? null,
            last_name: authProfile?.last_name ?? data?.last_name ?? null,
            phone: authProfile?.phone ?? data?.phone ?? null,
            gender: authProfile?.gender ?? data?.gender ?? null,
            rating: repData?.rating ?? null,
            reliability: repData?.reliability ?? null,
          };
          setProfile(prev => {
            if (prev && JSON.stringify(prev) === JSON.stringify(mergedProfile)) return prev;
            return mergedProfile;
          });
          setCached(profileCacheKey, { ...mergedProfile });
          lastFetchedAtRef.current = Date.now();
        } catch (e: any) {
          console.warn('[RequesterAccount] Background fetch error:', e.message);
          // leave existing UI untouched
        } finally {
          setLoading(false);
        }
      };
      fetchProfile();
    }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const verifStatus = authProfile?.verification_status;
  const verifBadge = !verifStatus || verifStatus === 'verified'
    ? null
    : verifStatus === 'under_review'
    ? { label: '⏳ Under Review', bg: '#2C2200', border: '#FF9F0A', color: '#FF9F0A' }
    : verifStatus === 'suspended'
    ? { label: '⊘ Suspended', bg: '#2C1010', border: '#FF3B30', color: '#FF3B30' }
    : null;

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
    const { error } = await supabase.from('profiles').update({ phone: cleaned }).eq('id', user!.id);
    setSavingPhone(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setProfile((prev) => prev ? { ...prev, phone: cleaned } : prev);
    invalidate(profileCacheKey);
    lastFetchedAtRef.current = 0; // force re-fetch on next focus
    setPhoneModalVisible(false);
  };

  const handleSaveGender = async (newGender: 'male' | 'female') => {
    setSavingGender(true);
    const { error } = await supabase.from('profiles').update({ gender: newGender }).eq('id', user!.id);
    setSavingGender(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setProfile((prev) => prev ? { ...prev, gender: newGender } : prev);
    invalidate(profileCacheKey);
    lastFetchedAtRef.current = 0;
    setGenderModalVisible(false);
  };

  const handleSignOut = () => {
    console.log('[Requester Account] Sign Out pressed — opening sign out modal');
    setShowSignOutModal(true);
  };

  const handleConfirmSignOut = async () => {
    console.log('[Requester Account] Sign Out confirmed');
    setShowSignOutModal(false);
    try {
      await supabase.auth.signOut();
      router.replace('/(auth)/role-select' as any);
    } catch (err: unknown) {
      console.error('[Requester Account] Sign out error:', err);
      logIncident({
        severity: 'warning',
        event_type: 'SIGN_OUT',
        failure_stage: 'auth',
        message: err instanceof Error ? err.message : String(err),
        user_action_completed: false,
      });
    }
  };

  // Only show full-screen spinner if we have no data at all (no authProfile seed)
  if (loading && profile === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1C1C1E" />
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Text style={styles.displayName}>{fullName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 13, color: '#F4A261', fontFamily: 'Inter_600SemiBold' }}>
                {'★ '}{profile?.rating != null ? profile.rating.toFixed(2) : '--'}
              </Text>
              <Text style={{ fontSize: 13, color: '#8E8E93' }}>{'·'}</Text>
              <Text style={{ fontSize: 13, color: '#34C759', fontFamily: 'Inter_400Regular' }}>
                {profile?.reliability != null ? Math.round(profile.reliability).toString() : '--'}{'%'}
              </Text>
            </View>
          </View>
          {verifBadge && (
            <View style={{ backgroundColor: verifBadge.bg, borderColor: verifBadge.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 }}>
              <Text style={{ fontSize: 13, color: verifBadge.color, fontWeight: '600' }}>{verifBadge.label}</Text>
            </View>
          )}
          <Text style={styles.emailText}>{userEmail}</Text>
        </View>

        <SectionHeader title="PROFILE" />
        <Card>
          <EditableRow label="Phone Number" value={phoneValue} onPress={openPhoneModal} />
          <CardDivider />
          <EditableRow label="Gender" value={genderValue} onPress={() => { setGenderModalVisible(true); }} />
        </Card>

        <SectionHeader title="SUPPORT" />
        <Card>
          <ActionRow label="Help Center" onPress={() => { router.push('/(requester)/(account)/help-center' as any); }} />
          <CardDivider />
          <ActionRow label="Contact Support" onPress={() => { router.push('/(requester)/(account)/contact-support' as any); }} />
        </Card>

        <SectionHeader title="ACCOUNT MANAGEMENT" />
        <Card>
          <ActionRow label="Switch to Cover & Earn" onPress={async () => {
            console.log('[Requester Account] Switch to Cover & Earn pressed');
            if (authProfile?.doctor_onboarding_complete) {
              if (switchingPortalRef.current) return;
              switchingPortalRef.current = true;
              await SecureStore.setItemAsync('flashlocum_last_pathway', 'doctor').catch(() => {});
              router.replace('/(doctor)/(home)' as any);
              // ref intentionally not reset — navigation away means this component unmounts
            } else {
              router.push({ pathname: '/(onboarding)/doctor/basic-profile', params: { from: 'requester-account' } } as any);
            }
          }} />
          <CardDivider />
          <ActionRow label="Account Settings" onPress={() => { console.log('[Requester Account] Account Settings pressed'); router.push('/(requester)/(account)/account-settings' as any); }} />
          <CardDivider />
          <ActionRow label="Sign Out" onPress={handleSignOut} />
        </Card>
      </ScrollView>

      {/* Phone Edit Modal */}
      <Modal visible={phoneModalVisible} transparent animationType="slide" onRequestClose={() => setPhoneModalVisible(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
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
              <TouchableOpacity style={[styles.modalSaveBtn, { opacity: savingPhone ? 0.65 : 1 }]} onPress={handleSavePhone} disabled={savingPhone}>
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
            <TouchableOpacity style={[styles.genderOption, { opacity: savingGender ? 0.65 : 1 }]} onPress={() => handleSaveGender('male')} disabled={savingGender}>
              <Text style={[styles.genderOptionText, profile?.gender === 'male' && styles.genderOptionSelected]}>Male</Text>
            </TouchableOpacity>
            <View style={styles.modalDivider} />
            <TouchableOpacity style={[styles.genderOption, { opacity: savingGender ? 0.65 : 1 }]} onPress={() => handleSaveGender('female')} disabled={savingGender}>
              <Text style={[styles.genderOptionText, profile?.gender === 'female' && styles.genderOptionSelected]}>Female</Text>
            </TouchableOpacity>
            {savingGender && <ActivityIndicator style={{ marginTop: 12 }} color="#1C1C1E" />}
          </View>
        </TouchableOpacity>
      </Modal>

      <SignOutModal
        visible={showSignOutModal}
        onCancel={() => setShowSignOutModal(false)}
        onConfirm={handleConfirmSignOut}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F5' },
  scrollContent: { paddingHorizontal: 16 },
  loadingContainer: { flex: 1, backgroundColor: '#F7F7F5', alignItems: 'center', justifyContent: 'center' },
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E5E5EA', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarInitials: { fontSize: 28, fontWeight: '700', color: '#1C1C1E' },
  displayName: { fontSize: 22, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
  emailText: { fontSize: 14, color: '#8E8E93' },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: '#8E8E93', letterSpacing: 1, marginBottom: 8, marginTop: 24, marginLeft: 4 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  cardDivider: { height: 1, backgroundColor: '#E5E5E5', marginLeft: 16 },
  rowLabel: { fontSize: 14, color: '#6B6B6B', flex: 1 },
  rowLabelRed: { color: '#E63946' },
  editablePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3A3A3C', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  editablePillText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', textAlign: 'center', marginBottom: 20 },
  modalInput: { backgroundColor: '#EFEFEF', borderRadius: 28, paddingHorizontal: 18, paddingVertical: 16, fontSize: 16, color: '#0A0A0A', marginBottom: 8 },
  modalInputError: { borderWidth: 1, borderColor: '#EF4444' },
  modalError: { fontSize: 12, color: '#EF4444', marginBottom: 8, marginLeft: 4 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: { flex: 1, backgroundColor: '#EFEFEF', borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  modalSaveBtn: { flex: 1, backgroundColor: '#3A3A3C', borderRadius: 28, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  genderOption: { paddingVertical: 18, alignItems: 'center' },
  genderOptionText: { fontSize: 17, color: '#1C1C1E', fontWeight: '400' },
  genderOptionSelected: { fontWeight: '700' },
  modalDivider: { height: 1, backgroundColor: '#E0E0E0' },
});

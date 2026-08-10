import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { ChevronRight } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';
import { getCached, setCached, invalidate } from '@/utils/tabCache';
import { SUPABASE_URL } from '@/constants/api';
import SignOutModal from '@/components/SignOutModal';

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SELFIE_URL_TTL_MS = 50 * 60 * 1000;   // 50 minutes (signed URLs expire at 60)

// Selfie URL cache — keyed by `${doctorId}:${rawPath}`, value: { url: string; cachedAt: number }
const _selfieUrlCache = new Map<string, { url: string; cachedAt: number }>();

interface DoctorProfile {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  gender: string | null;
  verification_status: string | null;
  mdcn_number: string | null;
  bank_name: string | null;
  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
  selfie_url: string | null;
  subaccount_code: string | null;
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

function SkeletonRow() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, [opacity]);
  return (
    <View style={styles.cardRow}>
      <Animated.View style={{ width: 100, height: 14, borderRadius: 7, backgroundColor: '#E5E5E5', opacity }} />
      <Animated.View style={{ width: 140, height: 14, borderRadius: 7, backgroundColor: '#E5E5E5', opacity }} />
    </View>
  );
}

export default function DoctorAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profile: authProfile } = useAuth();

  const profileCacheKey = user ? `doctor_profile_${user.id}` : 'doctor_profile';

  const [profile, setProfile] = useState<DoctorProfile | null>(() => {
    const cached = getCached<DoctorProfile>(user ? `doctor_profile_${user.id}` : 'doctor_profile');
    if (cached) return cached;
    if (!authProfile) return null;
    return {
      first_name: authProfile.first_name ?? null,
      last_name: authProfile.last_name ?? null,
      phone: authProfile.phone ?? null,
      gender: authProfile.gender ?? null,
      verification_status: null,
      mdcn_number: null,
      bank_name: null,
      bank_code: null,
      account_number: null,
      account_name: null,
      selfie_url: null,
      subaccount_code: null,
    };
  });
  // Only show loading state if we have no profile at all (no cache and no authProfile seed)
  const [loading, setLoading] = useState(getCached(user ? `doctor_profile_${user.id}` : 'doctor_profile') === null && profile === null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);

  const lastFetchedAtRef = useRef<number>(0);

  // Phone edit modal
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  // Gender edit modal
  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [savingGender, setSavingGender] = useState(false);

  // Retry subaccount
  const [retryingSubaccount, setRetryingSubaccount] = useState(false);
  const [retryError, setRetryError] = useState('');
  const [retrySuccess, setRetrySuccess] = useState(false);
  const [subaccountFailed, setSubaccountFailed] = useState(false);

  const [showSignOutModal, setShowSignOutModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      const now = Date.now();
      const isFresh = (now - lastFetchedAtRef.current) < PROFILE_CACHE_TTL_MS;
      if (isFresh && getCached(profileCacheKey)) return;

      const fetchProfile = async () => {
        try {
          const [profileRes, doctorProfileRes] = await Promise.all([
            supabase
              .from('profiles')
              .select('first_name, last_name, phone, gender, verification_status')
              .eq('id', user.id)
              .single(),
            supabase
              .from('doctor_profiles')
              .select('mdcn_number, bank_name, bank_code, account_number, account_name, selfie_url, subaccount_code')
              .eq('id', user.id)
              .single(),
          ]);

          if (profileRes.error && doctorProfileRes.error) {
            console.warn('[DoctorAccount] Background fetch failed:', profileRes.error.message);
            return; // leave existing UI untouched
          }

          const mergedProfile: DoctorProfile = {
            first_name: authProfile?.first_name ?? profileRes.data?.first_name ?? null,
            last_name: authProfile?.last_name ?? profileRes.data?.last_name ?? null,
            phone: authProfile?.phone ?? profileRes.data?.phone ?? null,
            gender: authProfile?.gender ?? profileRes.data?.gender ?? null,
            verification_status: profileRes.data?.verification_status ?? null,
            mdcn_number: doctorProfileRes.data?.mdcn_number ?? null,
            bank_name: doctorProfileRes.data?.bank_name ?? null,
            bank_code: doctorProfileRes.data?.bank_code ?? null,
            account_number: doctorProfileRes.data?.account_number ?? null,
            account_name: doctorProfileRes.data?.account_name ?? null,
            selfie_url: doctorProfileRes.data?.selfie_url ?? null,
            subaccount_code: doctorProfileRes.data?.subaccount_code ?? null,
          };

          const { data: failedSessionRows } = await supabase
            .from('coverage_sessions')
            .select('id')
            .eq('doctor_id', user.id)
            .eq('manual_settlement_required', true)
            .is('session_subaccount_code', null)
            .limit(1);

          setSubaccountFailed((failedSessionRows ?? []).length > 0);

          setProfile(prev => {
            if (prev && JSON.stringify(prev) === JSON.stringify(mergedProfile)) return prev;
            return mergedProfile;
          });
          setCached(profileCacheKey, { ...mergedProfile });
          lastFetchedAtRef.current = Date.now();

          // Selfie URL — only regenerate if path changed or URL is stale
          const rawSelfieUrl = doctorProfileRes.data?.selfie_url ?? null;
          if (rawSelfieUrl) {
            const selfieKey = `${user.id}:${rawSelfieUrl}`;
            const cached = _selfieUrlCache.get(selfieKey);
            const selfieIsStale = !cached || (Date.now() - cached.cachedAt) > SELFIE_URL_TTL_MS;
            if (selfieIsStale) {
              const { data: signedData } = await supabase.storage
                .from('doctor-documents')
                .createSignedUrl(rawSelfieUrl, 3600);
              if (signedData?.signedUrl) {
                _selfieUrlCache.set(selfieKey, { url: signedData.signedUrl, cachedAt: Date.now() });
                setSelfieUrl(signedData.signedUrl);
              }
            } else {
              // Reuse cached URL — no state update needed if already set
              setSelfieUrl(prev => prev === cached.url ? prev : cached.url);
            }
          }
        } catch (e: any) {
          console.warn('[DoctorAccount] Background fetch error:', e.message);
          // leave existing UI untouched
        } finally {
          setLoading(false);
        }
      };
      fetchProfile();
    }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  );

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
  const verifStatus = profile?.verification_status ?? 'pending';
  const verifBadge = verifStatus === 'verified'
    ? { label: '✓ Verified', bg: '#1A3A2A', border: '#34C759', color: '#34C759' }
    : verifStatus === 'under_review'
    ? { label: '⏳ Under Review', bg: '#2C2200', border: '#FF9F0A', color: '#FF9F0A' }
    : verifStatus === 'rejected'
    ? { label: '✕ Rejected', bg: '#2C1010', border: '#FF3B30', color: '#FF3B30' }
    : verifStatus === 'suspended'
    ? { label: '⊘ Suspended', bg: '#2C1010', border: '#FF3B30', color: '#FF3B30' }
    : { label: '⏳ Pending Review', bg: '#2C2200', border: '#FF9F0A', color: '#FF9F0A' };
  const bankName = profile?.bank_name ?? '—';
  const accountNumber = profile?.account_number ?? '—';
  const accountName = profile?.account_name ?? '—';

  // ── Phone edit ──
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
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setProfile((prev) => prev ? { ...prev, phone: cleaned } : prev);
    invalidate(profileCacheKey);
    lastFetchedAtRef.current = 0; // force re-fetch on next focus
    setPhoneModalVisible(false);
  };

  // ── Gender edit ──
  const handleSaveGender = async (newGender: 'male' | 'female') => {
    setSavingGender(true);
    const { error } = await supabase.from('profiles').update({ gender: newGender }).eq('id', user!.id);
    setSavingGender(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setProfile((prev) => prev ? { ...prev, gender: newGender } : prev);
    invalidate(profileCacheKey);
    lastFetchedAtRef.current = 0;
    setGenderModalVisible(false);
  };

  const handleSignOut = () => {
    console.log('[Doctor Account] Sign Out pressed — opening sign out modal');
    setShowSignOutModal(true);
  };

  const handleConfirmSignOut = async () => {
    console.log('[Doctor Account] Sign Out confirmed');
    setShowSignOutModal(false);
    await supabase.auth.signOut();
    router.replace('/(auth)/role-select' as any);
  };

  const handleRetrySubaccount = async () => {
    console.log('[Doctor Account] Retry Payout Setup pressed');
    if (!profile?.bank_code || !profile?.account_number || !profile?.account_name || !profile?.bank_name) {
      setRetryError('Bank details are incomplete. Please contact support.');
      return;
    }
    setRetryingSubaccount(true);
    setRetryError('');
    setRetrySuccess(false);
    try {
      // Step 1: Verify bank account before attempting sub-account creation
      console.log('[Doctor Account] Verifying bank account', { accountNumber: profile.account_number, bankCode: profile.bank_code });
      const verifyRes = await fetch(
        `${SUPABASE_URL}/functions/v1/monnify-verify-account`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountNumber: profile.account_number,
            bankCode: profile.bank_code,
          }),
        }
      );
      const verifyResult = await verifyRes.json();
      console.log('[Doctor Account] monnify-verify-account response', { status: verifyRes.status, verifyResult });

      if (!verifyRes.ok || verifyResult.error) {
        setRetryError(verifyResult.message || 'Could not verify your bank account. Please try again.');
        return;
      }

      // Step 2: Proceed to sub-account creation
      console.log('[Doctor Account] Calling create-subaccount edge function', { doctor_id: user!.id });
      const res = await fetchWithAuth(
        `${SUPABASE_URL}/functions/v1/create-subaccount`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctor_id: user!.id,
            bank_code: profile.bank_code,
            account_number: profile.account_number,
            account_name: profile.account_name,
            bank_name: profile.bank_name,
          }),
        }
      );
      const result = await res.json();
      console.log('[Doctor Account] create-subaccount response', { status: res.status, result });

      // SUBACCOUNT_EXISTS means setup is already complete — treat as success
      const isSuccess = (res.ok && !result.error) || result.error === 'SUBACCOUNT_EXISTS';

      if (!isSuccess) {
        throw new Error(result.message || result.error || 'Payout setup failed. Please try again.');
      }

      // Re-fetch the profile from DB to get the real subaccount_code
      const { data: refreshed } = await supabase
        .from('doctor_profiles')
        .select('subaccount_code')
        .eq('id', user!.id)
        .single();

      console.log('[Doctor Account] Refreshed subaccount_code from DB', refreshed?.subaccount_code);
      setProfile(prev => prev ? { ...prev, subaccount_code: refreshed?.subaccount_code ?? result.subaccount_code ?? 'set' } : prev);
      setRetrySuccess(true);
    } catch (err: unknown) {
      console.log('[Doctor Account] Retry payout setup error', err instanceof Error ? err.message : err);
      setRetryError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRetryingSubaccount(false);
    }
  };

  // If we have absolutely no profile data yet (no authProfile seed), show a minimal spinner
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
          {loading ? <SkeletonRow /> : <ReadOnlyRow label="MDCN Number" value={mdcnValue} />}
          <CardDivider />
          <EditableRow label="Gender" value={genderValue} onPress={() => { setGenderModalVisible(true); }} />
          <CardDivider />
          <View style={styles.cardRow}>
            <Text style={styles.rowLabel}>Verification Status</Text>
            {loading ? (
              <Animated.View style={{ width: 80, height: 26, borderRadius: 999, backgroundColor: '#E5E5E5' }} />
            ) : (
              <View style={[styles.verifiedBadge, { backgroundColor: verifBadge.bg, borderColor: verifBadge.border }]}>
                <Text style={[styles.verifiedText, { color: verifBadge.color }]}>{verifBadge.label}</Text>
              </View>
            )}
          </View>
        </Card>

        {/* Section 2 — FINANCIALS */}
        <SectionHeader title="FINANCIALS" />
        <Card>
          {loading ? (
            <>
              <SkeletonRow />
              <CardDivider />
              <SkeletonRow />
              <CardDivider />
              <SkeletonRow />
            </>
          ) : (
            <>
              <ReadOnlyRow label="Bank Name" value={bankName} />
              <CardDivider />
              <ReadOnlyRow label="Account Number" value={accountNumber} />
              <CardDivider />
              <ReadOnlyRow label="Account Name" value={accountName} />
              {!profile?.subaccount_code && subaccountFailed && !retrySuccess && (
                <>
                  <CardDivider />
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                    {retryError ? (
                      <Text style={{ color: '#E63946', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
                        {retryError}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      onPress={handleRetrySubaccount}
                      disabled={retryingSubaccount}
                      style={{
                        backgroundColor: retryingSubaccount ? '#C7C7CC' : '#1C1C1E',
                        borderRadius: 10,
                        paddingVertical: 12,
                        alignItems: 'center',
                      }}
                    >
                      {retryingSubaccount ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>
                          Retry Payout Setup
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
              {retrySuccess && (
                <>
                  <CardDivider />
                  <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                    <Text style={{ color: '#34C759', fontSize: 13, textAlign: 'center', fontWeight: '600' }}>
                      ✓ Payout account set up successfully
                    </Text>
                  </View>
                </>
              )}
            </>
          )}
        </Card>

        {/* Section 3 — SUPPORT */}
        <SectionHeader title="SUPPORT" />
        <Card>
          <ActionRow label="Help Center" onPress={() => { router.push('/(doctor)/(account)/help-center' as any); }} />
          <CardDivider />
          <ActionRow label="Contact Support" onPress={() => { router.push('/(doctor)/(account)/contact-support' as any); }} />
        </Card>

        {/* Section 4 — ACCOUNT MANAGEMENT */}
        <SectionHeader title="ACCOUNT MANAGEMENT" />
        <Card>
          <ActionRow label="Switch to Request Coverage" onPress={async () => {
            try {
              await SecureStore.setItemAsync('flashlocum_last_pathway', 'requester');
            } catch (e) {
              console.warn('[Doctor Account] Failed to persist last pathway before role switch:', e);
            }
            if (authProfile?.requester_onboarding_complete) {
              router.replace('/(requester)/(home)' as any);
            } else {
              router.push({ pathname: '/(onboarding)/requester/basic-profile', params: { from: 'doctor-account' } } as any);
            }
          }} />
          <CardDivider />
          <ActionRow label="Account Settings" onPress={() => { console.log('[Doctor Account] Account Settings pressed'); router.push('/(doctor)/(account)/account-settings' as any); }} />
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
  rowValue: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', textAlign: 'right', maxWidth: '55%' },
  editablePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3A3A3C', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  editablePillText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  verifiedBadge: { backgroundColor: '#1A3A2A', borderColor: '#34C759', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedText: { fontSize: 13, color: '#34C759', fontWeight: '600' },
  pendingBadge: { backgroundColor: '#3A2A1A', borderColor: '#F4A261', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pendingText: { fontSize: 13, color: '#F4A261', fontWeight: '600' },
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
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
});

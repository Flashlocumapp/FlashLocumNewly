import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';

const MONNIFY_BANKS_URL =
  'https://juilousufwlsiqdcgllu.supabase.co/functions/v1/monnify-verify-account/banks';
const MONNIFY_VERIFY_URL =
  'https://juilousufwlsiqdcgllu.supabase.co/functions/v1/monnify-verify-account';
const MONNIFY_SUBACCOUNT_URL =
  'https://juilousufwlsiqdcgllu.supabase.co/functions/v1/create-subaccount';
const MONNIFY_PROVISION_URL =
  'https://juilousufwlsiqdcgllu.supabase.co/functions/v1/provision-reserved-account';

// Verified Monnify split-payment subaccount whitelist (commercial banks only).
// Fintechs (VFD, Kuda, OPay, PalmPay, Moniepoint, Carbon) are excluded until
// Monnify explicitly documents split-payment support for them.
const MONNIFY_SPLIT_PAYMENT_WHITELIST = new Set([
  '044', // Access Bank
  '023', // Citibank
  '050', // Ecobank
  '070', // Fidelity Bank
  '011', // First Bank
  '214', // FCMB
  '058', // GTBank
  '082', // Keystone Bank
  '076', // Polaris Bank
  '101', // Providus Bank
  '221', // Stanbic IBTC
  '068', // Standard Chartered
  '232', // Sterling Bank
  '032', // Union Bank
  '033', // UBA
  '215', // Unity Bank
  '035', // Wema Bank
  '057', // Zenith Bank
]);

const FALLBACK_BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'Citibank', code: '023' },
  { name: 'Ecobank', code: '050' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'First Bank', code: '011' },
  { name: 'FCMB', code: '214' },
  { name: 'GTBank', code: '058' },
  { name: 'Keystone Bank', code: '082' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Providus Bank', code: '101' },
  { name: 'Stanbic IBTC', code: '221' },
  { name: 'Standard Chartered', code: '068' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'Union Bank', code: '032' },
  { name: 'UBA', code: '033' },
  { name: 'Unity Bank', code: '215' },
  { name: 'Wema Bank', code: '035' },
  { name: 'Zenith Bank', code: '057' },
];

const LOOKUP_TIMEOUT_MS = 12000;

/** Map structured error codes from edge functions to user-friendly messages. */
function mapErrorCode(code: string | undefined): string {
  switch (code) {
    case 'ACCOUNT_NOT_FOUND':
      return 'Account number not found. Please check your details and try again.';
    case 'BANK_UNSUPPORTED':
      return 'This bank is not currently supported for payouts. Please select a different bank.';
    case 'PROVIDER_TIMEOUT':
      return 'Verification is taking longer than expected. Please try again.';
    case 'PROVIDER_ERROR':
      return 'We could not verify your account at this time. Please try again.';
    case 'SUBACCOUNT_EXISTS':
      return 'A payout account is already registered. Contact support to update it.';
    default:
      return 'Account could not be verified. Please check your details and try again.';
  }
}

interface Bank {
  name: string;
  code: string;
}

const ACCOUNT_VERIFY_ERROR =
  'Account could not be verified automatically. Please double-check your account details.';
const ACCOUNT_MISMATCH_ERROR = "Account Name doesn't match name provided";

export default function DoctorPayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile } = useAuth();

  const [banks, setBanks] = useState<Bank[]>(FALLBACK_BANKS);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [bankModalVisible, setBankModalVisible] = useState(false);
  const [bankError, setBankError] = useState('');

  const [accountNumber, setAccountNumber] = useState('');
  const [accountNumberError, setAccountNumberError] = useState('');

  const [accountName, setAccountName] = useState('');
  const [accountNameLoading, setAccountNameLoading] = useState(false);
  const [accountNameError, setAccountNameError] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Saving...');
  const [submitError, setSubmitError] = useState('');

  // Holds the AbortController for any in-flight account lookup.
  const lookupAbortRef = useRef<AbortController | null>(null);

  // Load banks from Monnify, fall back to hardcoded list
  useEffect(() => {
    const loadBanks = async () => {
      try {
        const response = await fetchWithAuth(MONNIFY_BANKS_URL, {});
        if (!response.ok) {
          console.log('[Payout] Bank list load failed, using fallback');
          return;
        }
        const text = await response.text();
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          console.log('[Payout] Bank list load failed (JSON parse error), using fallback');
          return;
        }
        if (Array.isArray(json) && json.length > 0) {
          const normalised = json
            .map((b: any) => ({
              name: b.name || b.bankName || '',
              code: b.code || b.bankCode || '',
            }))
            .filter(
              (b) =>
                b.name &&
                b.code &&
                b.code.length === 3 &&
                MONNIFY_SPLIT_PAYMENT_WHITELIST.has(b.code)
            );
          if (normalised.length > 0) {
            setBanks(normalised);
            console.log(`[Payout] Banks loaded: ${normalised.length} banks`);
          } else {
            console.log('[Payout] Bank list load failed (no whitelisted banks), using fallback');
          }
        }
      } catch {
        console.log('[Payout] Bank list load failed, using fallback');
      }
    };
    loadBanks();
  }, []);

  const lookupAccountName = useCallback(
    async (bank: Bank, accNum: string) => {
      // Cancel any previous in-flight lookup
      if (lookupAbortRef.current) {
        lookupAbortRef.current.abort();
      }
      const controller = new AbortController();
      lookupAbortRef.current = controller;

      // Set a 12-second timeout that aborts the same controller
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, LOOKUP_TIMEOUT_MS);

      console.log(
        `[Payout] Account lookup started: bank=${bank.code}, account=****${accNum.slice(-4)}`
      );

      setAccountNameLoading(true);
      setAccountNameError('');
      setAccountName('');

      try {
        const response = await fetchWithAuth(MONNIFY_VERIFY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountNumber: accNum, bankCode: bank.code }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Safe JSON parse — edge function may return non-JSON on errors
        const text = await response.text();
        let result: any;
        try {
          result = JSON.parse(text);
        } catch {
          console.log('[Payout] Account lookup failed: errorCode=PROVIDER_ERROR (JSON parse)');
          setAccountNameError(mapErrorCode('PROVIDER_ERROR'));
          return;
        }

        if (!response.ok || result.error) {
          const code: string | undefined =
            typeof result?.error === 'string' ? result.error : undefined;
          console.log(`[Payout] Account lookup failed: errorCode=${code ?? 'unknown'}`);
          setAccountNameError(mapErrorCode(code));
          return;
        }

        const returnedName = String(result.accountName || '').toLowerCase();
        // Build registration name from profile first/last name, then user metadata, then email
        const profileFullName =
          profile?.first_name && profile?.last_name
            ? `${profile.first_name} ${profile.last_name}`
            : profile?.first_name || profile?.last_name || '';
        const rawRegistrationName = String(
          profileFullName || user?.user_metadata?.full_name || user?.email || ''
        ).toLowerCase();

        const stripTitles = (s: string) =>
          s.replace(/\b(dr|mr|mrs|ms|prof|sir)\b\.?\s*/gi, '').trim();

        const cleanReturned = stripTitles(returnedName);
        const cleanRegistration = stripTitles(rawRegistrationName);

        const regTokens = cleanRegistration.split(/\s+/).filter((t: string) => t.length > 1);
        // Take only first 2 meaningful tokens (first name, last name)
        const coreTokens = regTokens.slice(0, 2);
        const matchCount = coreTokens.filter((token: string) =>
          cleanReturned.includes(token)
        ).length;

        if (coreTokens.length > 0 && matchCount === 0) {
          console.log('[Payout] Account lookup failed: name mismatch');
          setAccountNameError(ACCOUNT_MISMATCH_ERROR);
          setAccountName('');
        } else {
          console.log('[Payout] Account lookup success: name resolved');
          setAccountName(String(result.accountName || ''));
        }
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        // Ignore aborted requests — a new lookup is already in flight
        if (err instanceof Error && err.name === 'AbortError') {
          // Check if this was a timeout abort (controller already fired) vs a
          // cancellation from a new lookup. Either way, if it was a timeout the
          // user should see the timeout message; if it was a cancellation we
          // stay silent. We distinguish by checking whether the timeout already
          // fired — but since we clearTimeout above only on success/non-abort
          // paths, a timeout abort will reach here with the timeout already
          // elapsed. Show the timeout message only if the component is still
          // showing this lookup (i.e. the controller is still current).
          if (lookupAbortRef.current === controller) {
            console.log('[Payout] Account lookup failed: errorCode=PROVIDER_TIMEOUT (timeout)');
            setAccountNameError(mapErrorCode('PROVIDER_TIMEOUT'));
          }
          return;
        }
        console.log('[Payout] Account lookup failed: errorCode=PROVIDER_ERROR');
        setAccountNameError(mapErrorCode('PROVIDER_ERROR'));
      } finally {
        setAccountNameLoading(false);
      }
    },
    [user, profile]
  );

  useEffect(() => {
    if (selectedBank && accountNumber.length === 10) {
      lookupAccountName(selectedBank, accountNumber);
    } else {
      // Cancel any in-flight lookup when inputs are cleared
      if (lookupAbortRef.current) {
        lookupAbortRef.current.abort();
        lookupAbortRef.current = null;
      }
      setAccountName('');
      setAccountNameError('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBank, accountNumber]);

  const handleBack = () => {
    if (profile?.onboarding_complete) {
      router.replace('/(doctor)/(home)' as any);
    } else {
      router.replace('/(auth)/role-select');
    }
  };

  const handleSubmit = async () => {
    if (loading) return;

    let valid = true;
    setBankError('');
    setAccountNumberError('');
    setSubmitError('');

    if (!selectedBank) {
      setBankError('Please select a bank');
      valid = false;
    }
    if (accountNumber.length !== 10) {
      setAccountNumberError('Account number must be exactly 10 digits');
      valid = false;
    }
    if (!accountName) {
      if (!accountNameError) {
        setAccountNameError('Please verify your account name before submitting');
      }
      valid = false;
    }
    if (!valid) return;

    console.log('[Payout] Submit started');
    setLoading(true);
    setLoadingLabel('Saving details...');

    try {
      const userId = user!.id;

      // Step 1: Save bank details
      console.log('[Payout] Step 1: saving bank details');
      const { error: doctorProfileError } = await supabase
        .from('doctor_profiles')
        .upsert({
          id: userId,
          bank_name: selectedBank!.name,
          bank_code: selectedBank!.code,
          account_number: accountNumber,
          account_name: accountName,
        });
      if (doctorProfileError) throw doctorProfileError;

      // Step 2: Create Monnify subaccount — BLOCKING, must succeed
      console.log('[Payout] Step 2: creating subaccount');
      setLoadingLabel('Setting up payout account...');
      const subaccountResponse = await fetchWithAuth(MONNIFY_SUBACCOUNT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: userId,
          bank_code: selectedBank!.code,
          account_number: accountNumber,
          account_name: accountName,
          bank_name: selectedBank!.name,
        }),
      });

      // Safe JSON parse for subaccount response
      const subaccountText = await subaccountResponse.text();
      let subaccountResult: any;
      try {
        subaccountResult = JSON.parse(subaccountText);
      } catch {
        subaccountResult = {};
      }

      if (!subaccountResponse.ok || subaccountResult.error) {
        const code: string | undefined =
          typeof subaccountResult?.error === 'string' ? subaccountResult.error : undefined;
        console.log(`[Payout] Submit failed: errorCode=${code ?? 'unknown'}`);
        setSubmitError(mapErrorCode(code));
        return;
      }

      // Step 2b: Provision Monnify reserved account for this doctor (non-blocking)
      console.log('[Payout] Step 2b: provisioning reserved account');
      setLoadingLabel('Setting up payment account...');
      try {
        const provisionResponse = await fetchWithAuth(MONNIFY_PROVISION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        await provisionResponse.text();
      } catch {
        // Non-blocking: don't fail onboarding if this step fails
      }

      // Step 3: Mark onboarding complete — only reached if subaccount succeeded
      console.log('[Payout] Step 3: marking onboarding complete');
      setLoadingLabel('Almost done...');
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: userId, onboarding_complete: true, doctor_onboarding_complete: true });
      if (profileError) throw profileError;

      console.log('[Payout] Submit success');
      await refreshProfile();
      router.replace('/(doctor)/(home)' as any);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      console.log(`[Payout] Submit failed: ${message}`);
      setSubmitError(message);
    } finally {
      setLoading(false);
      setLoadingLabel('Saving...');
    }
  };

  const bankDisplayValue = selectedBank ? selectedBank.name : 'Select bank...';
  const accountNamePlaceholder = 'Pick a bank and enter your 10-digit account';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <AnimatedPressable
          onPress={handleBack}
          scaleValue={0.9}
          style={styles.backButtonWrap}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <View style={styles.backCircle}>
            <Text style={styles.backChevron}>‹</Text>
          </View>
        </AnimatedPressable>
        <Text style={styles.headerLabel}>COVER & EARN · STEP 3 OF 3</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Payout account</Text>
        <Text style={styles.subtitle}>Where should we send your earnings?</Text>

        {/* Bank Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Bank name</Text>
          <AnimatedPressable
            onPress={() => {
              setBankModalVisible(true);
              setBankError('');
            }}
            scaleValue={0.98}
            style={[styles.dropdownContainer, bankError ? styles.inputError : null]}
          >
            <Text style={[styles.dropdownText, !selectedBank && styles.dropdownPlaceholder]}>
              {bankDisplayValue}
            </Text>
          </AnimatedPressable>
          {bankError ? <Text style={styles.inlineError}>{bankError}</Text> : null}
        </View>

        {/* Account Number */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Account number</Text>
          <View style={[styles.inputContainer, accountNumberError ? styles.inputError : null]}>
            <TextInput
              style={styles.input}
              placeholder="0123456789"
              placeholderTextColor="#ADADAD"
              value={accountNumber}
              onChangeText={text => {
                const digits = text.replace(/\D/g, '').slice(0, 10);
                setAccountNumber(digits);
                setAccountNumberError('');
              }}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
          {accountNumberError ? <Text style={styles.inlineError}>{accountNumberError}</Text> : null}
        </View>

        {/* Account Name (read-only) */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Account name</Text>
          <View style={[styles.inputContainer, accountNameError ? styles.inputError : null]}>
            {accountNameLoading ? (
              <View style={styles.accountNameLoadingRow}>
                <ActivityIndicator size="small" color="#8A8A8A" />
                <Text style={styles.accountNameLoadingText}>Verifying...</Text>
              </View>
            ) : (
              <Text style={[styles.input, !accountName && styles.accountNamePlaceholder]}>
                {accountName || accountNamePlaceholder}
              </Text>
            )}
          </View>
          {accountNameError ? <Text style={styles.inlineError}>{accountNameError}</Text> : null}
          {accountNameError && accountNumber.length === 10 && selectedBank && !accountNameLoading ? (
            <TouchableOpacity
              onPress={() => {
                console.log('[Payout] Retry account lookup tapped');
                setAccountNameError('');
                setAccountName('');
                lookupAccountName(selectedBank, accountNumber);
              }}
            >
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Submit error */}
        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

        {/* Submit button */}
        <AnimatedPressable
          onPress={handleSubmit}
          disabled={loading}
          scaleValue={0.97}
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.loadingLabel}>{loadingLabel}</Text>
            </View>
          ) : (
            <Text style={styles.submitLabel}>Submit</Text>
          )}
        </AnimatedPressable>
      </ScrollView>

      {/* Bank selection modal */}
      <Modal
        visible={bankModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBankModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setBankModalVisible(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select bank</Text>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {banks.map((bank, index) => (
                <View key={bank.code}>
                  <TouchableOpacity
                    style={styles.modalOption}
                    onPress={() => {
                      setSelectedBank(bank);
                      setBankModalVisible(false);
                      setBankError('');
                    }}
                  >
                    <Text style={[
                      styles.modalOptionText,
                      selectedBank?.code === bank.code && styles.modalOptionSelected,
                    ]}>
                      {bank.name}
                    </Text>
                    {selectedBank?.code === bank.code && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                  {index < banks.length - 1 && <View style={styles.modalDivider} />}
                </View>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F6',
  },
  flex: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: '#F9F9F6',
  },
  backButtonWrap: {
    position: 'absolute',
    left: 24,
    bottom: 16,
  },
  backCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 24,
    color: '#0A0A0A',
    lineHeight: 28,
    marginTop: -2,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A8A',
    letterSpacing: 1.5,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 8,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#8A8A8A',
    marginBottom: 32,
    lineHeight: 22,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6A6A6A',
    marginBottom: 8,
  },
  inputContainer: {
    backgroundColor: '#EFEFEF',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  input: {
    fontSize: 16,
    color: '#0A0A0A',
    padding: 0,
    margin: 0,
  },
  dropdownContainer: {
    backgroundColor: '#EFEFEF',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  dropdownText: {
    fontSize: 16,
    color: '#0A0A0A',
  },
  dropdownPlaceholder: {
    color: '#ADADAD',
  },
  inlineError: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 6,
  },
  accountNamePlaceholder: {
    color: '#ADADAD',
  },
  accountNameLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountNameLoadingText: {
    fontSize: 14,
    color: '#8A8A8A',
  },
  submitError: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
  },
  submitButton: {
    marginTop: 12,
    backgroundColor: '#0A0A0A',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8A8A',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  modalOption: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#0A0A0A',
    fontWeight: '400',
  },
  modalOptionSelected: {
    fontWeight: '700',
    color: '#0A0A0A',
  },
  checkmark: {
    fontSize: 16,
    color: '#0A0A0A',
    fontWeight: '700',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  retryText: {
    fontSize: 13,
    color: '#0A0A0A',
    textDecorationLine: 'underline',
    marginTop: 6,
  },
});

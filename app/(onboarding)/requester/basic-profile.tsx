import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  StyleSheet,
  unstable_batchedUpdates,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSplash } from '@/app/_layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { invalidate } from '@/utils/tabCache';

type Gender = 'male' | 'female' | null;

export default function RequesterBasicProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile } = useAuth();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { signalScreenReady } = useSplash();
  const splashSignalledRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!splashSignalledRef.current) {
        splashSignalledRef.current = true;
        signalScreenReady();
      }
    }, [signalScreenReady])
  );

  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<Gender>(null);
  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [genderError, setGenderError] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Pre-fill phone and gender from DB on mount
  useEffect(() => {
    if (!user?.id) return;
    const prefill = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('phone, gender')
          .eq('id', user.id)
          .single();
        if (!data) return;
        unstable_batchedUpdates(() => {
          if (data.phone) {
            console.log('[RequesterBasicProfile] Pre-filling phone from profile');
            setPhone(data.phone);
          }
          if (data.gender === 'male' || data.gender === 'female') {
            console.log('[RequesterBasicProfile] Pre-filling gender from profile:', data.gender);
            setGender(data.gender);
          }
        });
      } catch {
        // silently ignore
      }
    };
    prefill();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (from === 'doctor-account') {
      router.replace('/(doctor)/(account)' as any);
    } else if (profile?.requester_onboarding_complete) {
      router.replace('/(requester)/(home)' as any);
    } else {
      router.replace('/(auth)/role-select');
    }
  };

  const handleGenderSelect = (value: 'male' | 'female') => {
    setGender(value);
    setGenderError('');
    setGenderModalVisible(false);
  };

  const validatePhone = (value: string): boolean => {
    const cleaned = value.replace(/\s/g, '');
    return /^0\d{10}$/.test(cleaned);
  };

  const handleSubmit = async () => {
    if (loading) return;

    let valid = true;
    setPhoneError('');
    setGenderError('');
    setSubmitError('');

    const cleanedPhone = phone.replace(/\s/g, '');
    if (!validatePhone(cleanedPhone)) {
      setPhoneError('Ensure you enter the correct Nigeria number');
      valid = false;
    }
    if (!gender) {
      setGenderError('Please select a gender');
      valid = false;
    }
    if (!valid) return;

    setLoading(true);

    try {
      // Strip any title prefix (Dr., Mr., Mrs., Prof. etc.) before splitting
      const rawFull: string = user?.user_metadata?.full_name ?? '';
      const strippedFull = rawFull.replace(/^(dr|mr|mrs|ms|prof|sir)\.?\s*/i, '').trim();
      const spaceIdx = strippedFull.indexOf(' ');
      const firstName = spaceIdx > -1 ? strippedFull.slice(0, spaceIdx).trim() : strippedFull.trim();
      const lastName = spaceIdx > -1 ? strippedFull.slice(spaceIdx + 1).trim() : '';

      const isTransientNetworkError = (e: unknown): boolean =>
        e instanceof Error && /failed to fetch|network request failed|load failed|fetch failed/i.test(e.message);

      const upsertWithRetry = async <T,>(fn: () => Promise<{ error: T | null }>): Promise<{ error: T | null }> => {
        const first = await fn();
        if (!first.error) return first;
        if (!isTransientNetworkError(first.error)) return first;
        await new Promise(r => setTimeout(r, 1000));
        return fn();
      };

      // Write 1: profile data only — no completion flags yet
      console.log('[RequesterOnboarding] Write 1 — upserting profile data');
      const { error: profileError } = await upsertWithRetry(async () =>
        supabase.from('profiles').upsert({
          id: user!.id,
          first_name: firstName,
          last_name: lastName,
          phone: cleanedPhone,
          gender,
        })
      );

      if (profileError) throw profileError;

      // Write 2: create requester_profiles row
      console.log('[RequesterOnboarding] Write 2 — upserting requester_profiles');
      const { error: requesterError } = await upsertWithRetry(async () =>
        supabase.from('requester_profiles').upsert({ id: user!.id }, { onConflict: 'id' })
      );

      if (requesterError) throw requesterError;

      // Write 3: mark onboarding complete — only reached if both writes above succeeded
      console.log('[RequesterOnboarding] Write 3 — marking onboarding complete');
      const { error: completionError } = await upsertWithRetry(async () =>
        supabase.from('profiles').upsert({
          id: user!.id,
          onboarding_complete: true,
          requester_onboarding_complete: true,
        })
      );

      if (completionError) throw completionError;

      invalidate(`requester_profile_${user!.id}`);
      await refreshProfile();
      await SecureStore.setItemAsync('flashlocum_last_pathway', 'requester').catch(() => {});
      router.replace('/(requester)/(home)' as any);
    } catch (err: any) {
      setSubmitError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const genderDisplayValue = gender
    ? gender.charAt(0).toUpperCase() + gender.slice(1)
    : 'Select...';

  return (
    <View style={styles.container}>
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
        <Text style={styles.headerLabel}>REQUEST COVERAGE</Text>
      </View>

      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Basic profile</Text>
        <Text style={styles.subtitle}>Tell us a little about you. You can edit this anytime.</Text>

        {/* Phone number */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Phone number</Text>
          <View style={[styles.inputContainer, phoneError ? styles.inputError : null]}>
            <TextInput
              style={styles.input}
              placeholder="080XXXXXXXX"
              placeholderTextColor="#ADADAD"
              value={phone}
              onChangeText={text => {
                setPhone(text);
                setPhoneError('');
              }}
              keyboardType="phone-pad"
              maxLength={11}
            />
          </View>
          {phoneError ? <Text style={styles.inlineError}>{phoneError}</Text> : null}
        </View>

        {/* Gender */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Gender</Text>
          <AnimatedPressable
            onPress={() => {
              setGenderModalVisible(true);
            }}
            scaleValue={0.95}
            hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
            style={[styles.dropdownContainer, genderError ? styles.inputError : null]}
          >
            <Text style={[styles.dropdownText, !gender && styles.dropdownPlaceholder]}>
              {genderDisplayValue}
            </Text>
          </AnimatedPressable>
          {genderError ? <Text style={styles.inlineError}>{genderError}</Text> : null}
        </View>

        {/* Submit error */}
        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

        {/* Submit button */}
        <AnimatedPressable
          onPress={handleSubmit}
          disabled={loading}
          scaleValue={0.95}
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitLabel}>Submit</Text>
          )}
        </AnimatedPressable>
      </KeyboardAwareScrollView>

      {/* Gender Modal */}
      <Modal
        visible={genderModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGenderModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setGenderModalVisible(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select gender</Text>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleGenderSelect('male')}
            >
              <Text style={[styles.modalOptionText, gender === 'male' && styles.modalOptionSelected]}>
                Male
              </Text>
            </TouchableOpacity>
            <View style={styles.modalDivider} />
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleGenderSelect('female')}
            >
              <Text style={[styles.modalOptionText, gender === 'female' && styles.modalOptionSelected]}>
                Female
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
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
    paddingVertical: 18,
    alignItems: 'center',
  },
  modalOptionText: {
    fontSize: 17,
    color: '#0A0A0A',
    fontWeight: '400',
  },
  modalOptionSelected: {
    fontWeight: '700',
    color: '#0A0A0A',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
});

import React, { useState } from 'react';
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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';

type Gender = 'male' | 'female' | null;

export default function DoctorBasicProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<Gender>(null);
  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const [phoneError, setPhoneError] = useState('');
  const [genderError, setGenderError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const handleBack = () => {
    console.log('[DoctorBasicProfile] Back button pressed, doctor_onboarding_complete:', profile?.doctor_onboarding_complete);
    if (profile?.doctor_onboarding_complete) {
      router.replace('/(doctor)/(home)' as any);
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
    return /^0\d{10}$/.test(value);
  };

  const handleContinue = async () => {
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
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user!.id,
          phone: cleanedPhone,
          gender,
        });

      if (profileError) throw profileError;

      router.push('/(onboarding)/doctor/credentials');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  };

  const genderDisplayValue = gender
    ? gender.charAt(0).toUpperCase() + gender.slice(1)
    : 'Select...';

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
        <Text style={styles.headerLabel}>COVER & EARN · STEP 1 OF 3</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Basic profile</Text>
        <Text style={styles.subtitle}>Tell us a little about you.</Text>

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
            onPress={() => setGenderModalVisible(true)}
            scaleValue={0.98}
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

        {/* Continue button */}
        <AnimatedPressable
          onPress={handleContinue}
          disabled={loading}
          scaleValue={0.97}
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitLabel}>Continue</Text>
          )}
        </AnimatedPressable>
      </ScrollView>

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F5',
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
    backgroundColor: '#F7F7F5',
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

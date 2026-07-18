import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { AnimatedPressable } from '@/components/AnimatedPressable';

function EyeOpen() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="#ADADAD"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke="#ADADAD"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function EyeClosed() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
        stroke="#ADADAD"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M1 1l22 22"
        stroke="#ADADAD"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function NewPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string; role?: string }>();

  const email = params.email ?? '';
  const role = params.role === 'doctor' ? 'doctor' : 'requester';
  const roleLabel = role === 'requester' ? 'REQUEST COVERAGE' : 'COVER & EARN';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const confirmRef = useRef<TextInput>(null);

  const handleBack = () => {
    router.back();
  };

  const handleTogglePassword = () => {
    setShowPassword(prev => !prev);
  };

  const handleToggleConfirm = () => {
    setShowConfirm(prev => !prev);
  };

  const handleSubmit = async () => {
    if (loading || success) return;

    if (!password || !confirmPassword) {
      setError('Please fill in both fields.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (updateError) {
      setError(updateError.message || 'Failed to update password. Please try again.');
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.replace(`/(auth)/sign-up?mode=signin&role=${role}` as any);
      }, 1500);
    }
  };

  const buttonLabel = success ? 'Password updated!' : 'Update password';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior="padding"
    >
      {/* Header */}
      <View style={styles.headerBar}>
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
        <Text style={styles.headerLabel}>{roleLabel}</Text>
      </View>

      {/* Content */}
      <View style={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={styles.heading}>Set new password</Text>
        <Text style={styles.subtitle}>
          Choose a strong password for your FlashLocum account.
        </Text>

        {/* Password field */}
        <Text style={styles.fieldLabel}>New password</Text>
        <View style={[styles.inputContainer, styles.inputContainerRow]}>
          <TextInput
            style={[styles.input, styles.inputFlex]}
            placeholder="••••••••"
            placeholderTextColor="#ADADAD"
            value={password}
            onChangeText={text => {
              setPassword(text);
              setError('');
            }}
            secureTextEntry={!showPassword}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
          <AnimatedPressable
            onPress={handleTogglePassword}
            scaleValue={0.9}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {showPassword ? <EyeClosed /> : <EyeOpen />}
          </AnimatedPressable>
        </View>

        {/* Confirm password field */}
        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Confirm password</Text>
        <View style={[styles.inputContainer, styles.inputContainerRow]}>
          <TextInput
            ref={confirmRef}
            style={[styles.input, styles.inputFlex]}
            placeholder="••••••••"
            placeholderTextColor="#ADADAD"
            value={confirmPassword}
            onChangeText={text => {
              setConfirmPassword(text);
              setError('');
            }}
            secureTextEntry={!showConfirm}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          <AnimatedPressable
            onPress={handleToggleConfirm}
            scaleValue={0.9}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {showConfirm ? <EyeClosed /> : <EyeOpen />}
          </AnimatedPressable>
        </View>

        {/* Submit button */}
        <AnimatedPressable
          onPress={handleSubmit}
          disabled={loading || success}
          scaleValue={0.97}
          style={[
            styles.submitButton,
            (loading || success) && styles.buttonDisabled,
            success && styles.buttonSuccess,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitLabel}>{buttonLabel}</Text>
          )}
        </AnimatedPressable>

        {/* Error */}
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  backButtonWrap: {
    position: 'absolute',
    left: 24,
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
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 16,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#8A8A8A',
    lineHeight: 22,
    marginBottom: 32,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6A6A6A',
    marginBottom: 8,
  },
  fieldLabelSpaced: {
    marginTop: 20,
  },
  inputContainer: {
    backgroundColor: '#EFEFEF',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  inputContainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    fontSize: 16,
    color: '#0A0A0A',
    padding: 0,
    margin: 0,
  },
  inputFlex: {
    flex: 1,
  },
  submitButton: {
    marginTop: 32,
    backgroundColor: '#0A0A0A',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonSuccess: {
    backgroundColor: '#16A34A',
    opacity: 1,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 4,
  },
});

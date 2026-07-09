import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { AnimatedPressable } from '@/components/AnimatedPressable';

export default function ResetVerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string; role?: string }>();

  const email = params.email ?? '';
  const role = params.role === 'doctor' ? 'doctor' : 'requester';
  const roleLabel = role === 'requester' ? 'REQUEST COVERAGE' : 'COVER & EARN';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = () => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleBack = () => {
    router.back();
  };

  const handleVerify = async () => {
    if (loading) return;
    if (code.length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }

    setLoading(true);
    setError('');

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'recovery',
    });

    setLoading(false);

    if (verifyError) {
      setError(verifyError.message || 'Invalid code. Please try again.');
    } else {
      router.push(
        `/(auth)/new-password?email=${encodeURIComponent(email)}&role=${role}` as any
      );
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    startCooldown();
    await supabase.auth.resetPasswordForEmail(email);
  };

  const handleBackToSignIn = () => {
    router.replace(`/(auth)/sign-up?mode=signin&role=${role}` as any);
  };

  const resendLabel = resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
        <Text style={styles.heading}>Enter reset code</Text>
        <Text style={styles.subtitle}>
          {"We've sent a 6-digit code to "}
          <Text style={styles.emailHighlight}>{email}</Text>
          {". Enter it below to reset your password."}
        </Text>

        {/* OTP Input */}
        <View style={styles.otpContainer}>
          <TextInput
            style={styles.otpInput}
            value={code}
            onChangeText={text => {
              const digits = text.replace(/[^0-9]/g, '');
              setCode(digits);
              setError('');
            }}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="------"
            placeholderTextColor="#CCCCCC"
            autoFocus
          />
        </View>

        {/* Verify button */}
        <AnimatedPressable
          onPress={handleVerify}
          disabled={loading}
          scaleValue={0.97}
          style={[styles.verifyButton, loading && styles.buttonDisabled]}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.verifyLabel}>Verify & continue</Text>
          )}
        </AnimatedPressable>

        {/* Error */}
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* Resend button */}
        <AnimatedPressable
          onPress={handleResend}
          disabled={resendCooldown > 0}
          scaleValue={0.97}
          style={[styles.resendButton, resendCooldown > 0 && styles.resendDisabled]}
        >
          <Text style={[styles.resendLabel, resendCooldown > 0 && styles.resendLabelDisabled]}>
            {resendLabel}
          </Text>
        </AnimatedPressable>

        {/* Back to sign in */}
        <AnimatedPressable
          onPress={handleBackToSignIn}
          scaleValue={0.97}
          style={styles.backToSignInWrap}
        >
          <Text style={styles.backToSignIn}>Back to sign in</Text>
        </AnimatedPressable>
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
  emailHighlight: {
    color: '#0A0A0A',
    fontWeight: '500',
  },
  otpContainer: {
    backgroundColor: '#EFEFEF',
    borderRadius: 50,
    paddingHorizontal: 24,
    paddingVertical: 18,
    marginBottom: 16,
  },
  otpInput: {
    fontSize: 28,
    fontWeight: '600',
    color: '#0A0A0A',
    letterSpacing: 8,
    textAlign: 'center',
    padding: 0,
    margin: 0,
  },
  verifyButton: {
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
  verifyLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
  },
  resendButton: {
    backgroundColor: '#EFEFEF',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  resendDisabled: {
    opacity: 0.6,
  },
  resendLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0A0A0A',
  },
  resendLabelDisabled: {
    color: '#8A8A8A',
  },
  backToSignInWrap: {
    alignItems: 'center',
  },
  backToSignIn: {
    fontSize: 14,
    color: '#0A0A0A',
    textDecorationLine: 'underline',
  },
});

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Mail, Lock, CheckCircle } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const surface = isDark ? COLORS.dark.surface : COLORS.surface;
  const bg = isDark ? COLORS.dark.background : COLORS.background;
  const textColor = isDark ? COLORS.dark.text : COLORS.text;
  const textSecondary = isDark ? COLORS.dark.textSecondary : COLORS.textSecondary;
  const borderColor = isDark ? COLORS.dark.border : COLORS.border;
  const inputBg = isDark ? COLORS.dark.surfaceSecondary : COLORS.surfaceSecondary;
  const iconColor = isDark ? COLORS.dark.textTertiary : COLORS.textTertiary;

  const validateEmail = () => {
    if (!email) {
      setEmailError('Email is required');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('Enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  const validatePassword = () => {
    if (!password) {
      setPasswordError('Password is required');
      return false;
    }
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const validateConfirmPassword = () => {
    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      return false;
    }
    if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      return false;
    }
    setConfirmPasswordError('');
    return true;
  };

  const handleSignUp = async () => {
    console.log('[SignUp] Create account button pressed');
    const emailValid = validateEmail();
    const passwordValid = validatePassword();
    const confirmValid = validateConfirmPassword();
    if (!emailValid || !passwordValid || !confirmValid) return;

    setLoading(true);
    setError('');
    console.log('[SignUp] Attempting sign up for:', email);

    const { error: signUpError } = await signUp(email, password);

    setLoading(false);
    if (signUpError) {
      console.log('[SignUp] Sign up failed:', signUpError.message);
      setError(signUpError.message || 'Sign up failed. Please try again.');
    } else {
      console.log('[SignUp] Sign up success — confirmation email sent');
      setSuccess(true);
    }
  };

  const handleGoToSignIn = () => {
    console.log('[SignUp] Navigate to sign-in pressed');
    router.push('/(auth)/sign-in');
  };

  const handleTogglePassword = () => {
    console.log('[SignUp] Toggle password visibility');
    setShowPassword(prev => !prev);
  };

  const handleToggleConfirmPassword = () => {
    console.log('[SignUp] Toggle confirm password visibility');
    setShowConfirmPassword(prev => !prev);
  };

  if (success) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: SPACING.xl,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: RADIUS.full,
            backgroundColor: COLORS.successMuted,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: SPACING.xl,
          }}
        >
          <CheckCircle size={36} color={COLORS.success} />
        </View>
        <Text
          style={[
            TYPOGRAPHY.h2,
            { color: textColor, textAlign: 'center', marginBottom: SPACING.base },
          ]}
        >
          Check your email
        </Text>
        <Text
          style={[
            TYPOGRAPHY.body,
            { color: textSecondary, textAlign: 'center', marginBottom: SPACING.xxxl },
          ]}
        >
          We sent a confirmation link to{' '}
          <Text style={{ color: COLORS.primary, fontWeight: '600' }}>{email}</Text>
          {'. '}
          Click the link to activate your account.
        </Text>
        <AnimatedPressable
          onPress={handleGoToSignIn}
          style={{
            backgroundColor: COLORS.primary,
            borderRadius: RADIUS.lg,
            height: 52,
            paddingHorizontal: SPACING.xxxl,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 102, 204, 0.30)',
          }}
        >
          <Text style={[TYPOGRAPHY.bodySemibold, { color: COLORS.textInverse }]}>
            Back to sign in
          </Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: SPACING.xl,
          paddingTop: SPACING.xxxl + SPACING.xl,
          paddingBottom: SPACING.xxxl,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: SPACING.xxxl }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: RADIUS.lg,
              backgroundColor: COLORS.primary,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: SPACING.lg,
              boxShadow: '0 8px 24px rgba(0, 102, 204, 0.30)',
            }}
          >
            <Text style={{ fontSize: 28, color: COLORS.textInverse, fontWeight: '700' }}>
              FL
            </Text>
          </View>
          <Text
            style={[
              TYPOGRAPHY.h1,
              { color: textColor, textAlign: 'center', marginBottom: SPACING.sm },
            ]}
          >
            FlashLocum
          </Text>
          <Text
            style={[
              TYPOGRAPHY.body,
              { color: textSecondary, textAlign: 'center' },
            ]}
          >
            Medical coverage, simplified.
          </Text>
        </View>

        {/* Form card */}
        <View
          style={{
            backgroundColor: surface,
            borderRadius: RADIUS.xl,
            padding: SPACING.xl,
            borderWidth: 1,
            borderColor,
            boxShadow: '0 4px 16px rgba(0, 102, 204, 0.08)',
            marginBottom: SPACING.xl,
          }}
        >
          <Text
            style={[
              TYPOGRAPHY.h3,
              { color: textColor, marginBottom: SPACING.xl },
            ]}
          >
            Create account
          </Text>

          {/* Email field */}
          <View style={{ marginBottom: SPACING.base }}>
            <Text
              style={[
                TYPOGRAPHY.captionMedium,
                { color: textSecondary, marginBottom: SPACING.sm },
              ]}
            >
              EMAIL ADDRESS
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: inputBg,
                borderRadius: RADIUS.md,
                borderWidth: 1.5,
                borderColor: emailFocused ? COLORS.primary : emailError ? COLORS.danger : borderColor,
                paddingHorizontal: SPACING.base,
                height: 52,
              }}
            >
              <Mail size={18} color={emailFocused ? COLORS.primary : iconColor} />
              <TextInput
                style={[
                  TYPOGRAPHY.body,
                  {
                    flex: 1,
                    color: textColor,
                    marginLeft: SPACING.sm,
                    paddingVertical: 0,
                  },
                ]}
                placeholder="you@example.com"
                placeholderTextColor={isDark ? COLORS.dark.textTertiary : COLORS.textTertiary}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => {
                  setEmailFocused(false);
                  validateEmail();
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>
            {emailError ? (
              <Text
                style={[
                  TYPOGRAPHY.caption,
                  { color: COLORS.danger, marginTop: SPACING.xs },
                ]}
              >
                {emailError}
              </Text>
            ) : null}
          </View>

          {/* Password field */}
          <View style={{ marginBottom: SPACING.base }}>
            <Text
              style={[
                TYPOGRAPHY.captionMedium,
                { color: textSecondary, marginBottom: SPACING.sm },
              ]}
            >
              PASSWORD
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: inputBg,
                borderRadius: RADIUS.md,
                borderWidth: 1.5,
                borderColor: passwordFocused ? COLORS.primary : passwordError ? COLORS.danger : borderColor,
                paddingHorizontal: SPACING.base,
                height: 52,
              }}
            >
              <Lock size={18} color={passwordFocused ? COLORS.primary : iconColor} />
              <TextInput
                ref={passwordRef}
                style={[
                  TYPOGRAPHY.body,
                  {
                    flex: 1,
                    color: textColor,
                    marginLeft: SPACING.sm,
                    paddingVertical: 0,
                  },
                ]}
                placeholder="Minimum 8 characters"
                placeholderTextColor={isDark ? COLORS.dark.textTertiary : COLORS.textTertiary}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => {
                  setPasswordFocused(false);
                  validatePassword();
                }}
                secureTextEntry={!showPassword}
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
              />
              <AnimatedPressable onPress={handleTogglePassword} scaleValue={0.9}>
                {showPassword
                  ? <EyeOff size={18} color={iconColor} />
                  : <Eye size={18} color={iconColor} />
                }
              </AnimatedPressable>
            </View>
            {passwordError ? (
              <Text
                style={[
                  TYPOGRAPHY.caption,
                  { color: COLORS.danger, marginTop: SPACING.xs },
                ]}
              >
                {passwordError}
              </Text>
            ) : null}
          </View>

          {/* Confirm password field */}
          <View style={{ marginBottom: SPACING.xl }}>
            <Text
              style={[
                TYPOGRAPHY.captionMedium,
                { color: textSecondary, marginBottom: SPACING.sm },
              ]}
            >
              CONFIRM PASSWORD
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: inputBg,
                borderRadius: RADIUS.md,
                borderWidth: 1.5,
                borderColor: confirmFocused ? COLORS.primary : confirmPasswordError ? COLORS.danger : borderColor,
                paddingHorizontal: SPACING.base,
                height: 52,
              }}
            >
              <Lock size={18} color={confirmFocused ? COLORS.primary : iconColor} />
              <TextInput
                ref={confirmRef}
                style={[
                  TYPOGRAPHY.body,
                  {
                    flex: 1,
                    color: textColor,
                    marginLeft: SPACING.sm,
                    paddingVertical: 0,
                  },
                ]}
                placeholder="Re-enter your password"
                placeholderTextColor={isDark ? COLORS.dark.textTertiary : COLORS.textTertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => setConfirmFocused(true)}
                onBlur={() => {
                  setConfirmFocused(false);
                  validateConfirmPassword();
                }}
                secureTextEntry={!showConfirmPassword}
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
              />
              <AnimatedPressable onPress={handleToggleConfirmPassword} scaleValue={0.9}>
                {showConfirmPassword
                  ? <EyeOff size={18} color={iconColor} />
                  : <Eye size={18} color={iconColor} />
                }
              </AnimatedPressable>
            </View>
            {confirmPasswordError ? (
              <Text
                style={[
                  TYPOGRAPHY.caption,
                  { color: COLORS.danger, marginTop: SPACING.xs },
                ]}
              >
                {confirmPasswordError}
              </Text>
            ) : null}
          </View>

          {/* Error message */}
          {error ? (
            <View
              style={{
                backgroundColor: COLORS.dangerMuted,
                borderRadius: RADIUS.md,
                padding: SPACING.base,
                marginBottom: SPACING.base,
                borderWidth: 1,
                borderColor: 'rgba(230, 57, 70, 0.20)',
              }}
            >
              <Text style={[TYPOGRAPHY.captionMedium, { color: COLORS.danger }]}>
                {error}
              </Text>
            </View>
          ) : null}

          {/* Create account button */}
          <AnimatedPressable
            onPress={handleSignUp}
            disabled={loading}
            style={{
              backgroundColor: COLORS.primary,
              borderRadius: RADIUS.lg,
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 102, 204, 0.30)',
            }}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={[TYPOGRAPHY.bodySemibold, { color: COLORS.textInverse }]}>
                Create account
              </Text>
            )}
          </AnimatedPressable>
        </View>

        {/* Sign in link */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={[TYPOGRAPHY.body, { color: textSecondary }]}>
            Already have an account?
          </Text>
          <AnimatedPressable onPress={handleGoToSignIn} scaleValue={0.95} style={{ marginLeft: SPACING.xs }}>
            <Text style={[TYPOGRAPHY.bodySemibold, { color: COLORS.primary }]}>
              Sign in
            </Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

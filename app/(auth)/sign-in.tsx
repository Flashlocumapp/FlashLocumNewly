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
import { Eye, EyeOff, Mail, Lock } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const surface = isDark ? COLORS.dark.surface : COLORS.surface;
  const bg = isDark ? COLORS.dark.background : COLORS.background;
  const textColor = isDark ? COLORS.dark.text : COLORS.text;
  const textSecondary = isDark ? COLORS.dark.textSecondary : COLORS.textSecondary;
  const borderColor = isDark ? COLORS.dark.border : COLORS.border;
  const inputBg = isDark ? COLORS.dark.surfaceSecondary : COLORS.surfaceSecondary;

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
    setPasswordError('');
    return true;
  };

  const handleSignIn = async () => {
    console.log('[SignIn] Sign in button pressed');
    const emailValid = validateEmail();
    const passwordValid = validatePassword();
    if (!emailValid || !passwordValid) return;

    setLoading(true);
    setError('');
    console.log('[SignIn] Attempting sign in for:', email);

    const { error: signInError } = await signIn(email, password);

    setLoading(false);
    if (signInError) {
      console.log('[SignIn] Sign in failed:', signInError.message);
      setError(signInError.message || 'Sign in failed. Please try again.');
    }
    // NavigationGuard handles redirect on success
  };

  const handleGoToSignUp = () => {
    console.log('[SignIn] Navigate to sign-up pressed');
    router.push('/(auth)/sign-up');
  };

  const handleTogglePassword = () => {
    console.log('[SignIn] Toggle password visibility');
    setShowPassword(prev => !prev);
  };

  const iconColor = isDark ? COLORS.dark.textTertiary : COLORS.textTertiary;

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
            Sign in
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
          <View style={{ marginBottom: SPACING.xl }}>
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
                placeholder="Enter your password"
                placeholderTextColor={isDark ? COLORS.dark.textTertiary : COLORS.textTertiary}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => {
                  setPasswordFocused(false);
                  validatePassword();
                }}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
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

          {/* Sign in button */}
          <AnimatedPressable
            onPress={handleSignIn}
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
                Sign in
              </Text>
            )}
          </AnimatedPressable>
        </View>

        {/* Sign up link */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={[TYPOGRAPHY.body, { color: textSecondary }]}>
            Don&apos;t have an account?
          </Text>
          <AnimatedPressable onPress={handleGoToSignUp} scaleValue={0.95} style={{ marginLeft: SPACING.xs }}>
            <Text style={[TYPOGRAPHY.bodySemibold, { color: COLORS.primary }]}>
              Sign up
            </Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

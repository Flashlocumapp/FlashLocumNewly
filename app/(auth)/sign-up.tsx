import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageSourcePropType,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { AnimatedPressable } from '@/components/AnimatedPressable';

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

const wordmark = require('@/assets/images/d5820e75-3b63-4adb-b820-37ad1d151041.png');

type Mode = 'signup' | 'signin';
type Role = 'doctor' | 'requester';

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ role?: string; mode?: string }>();

  const initialMode: Mode = params.mode === 'signin' ? 'signin' : 'signup';
  const initialRole: Role = params.role === 'doctor' ? 'doctor' : 'requester';

  const [mode, setMode] = useState<Mode>(initialMode);
  const [role] = useState<Role>(initialRole);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const clearForm = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setError('');
  };

  const switchMode = (next: Mode) => {
    console.log('[SignUp] Mode switched to:', next);
    clearForm();
    setMode(next);
  };

  const handleBack = () => {
    console.log('[SignUp] Back button pressed');
    router.back();
  };

  const handleTogglePassword = () => {
    setShowPassword(prev => !prev);
  };

  const handleSubmit = async () => {
    if (loading) return;

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (mode === 'signup' && !fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    setLoading(true);
    setError('');

    if (mode === 'signup') {
      console.log('[SignUp] Create account pressed — email:', email, 'role:', role);
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role,
          },
        },
      });
      setLoading(false);
      if (signUpError) {
        console.log('[SignUp] Sign up error:', signUpError.message);
        setError(signUpError.message || 'Sign up failed. Please try again.');
      } else {
        console.log('[SignUp] Sign up success, navigating to home');
        router.replace('/(app)/(home)');
      }
    } else {
      console.log('[SignUp] Sign in pressed — email:', email);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setLoading(false);
      if (signInError) {
        console.log('[SignUp] Sign in error:', signInError.message);
        setError(signInError.message || 'Sign in failed. Please try again.');
      } else {
        console.log('[SignUp] Sign in success, navigating to home');
        router.replace('/(app)/(home)');
      }
    }
  };

  const namePlaceholder = role === 'doctor' ? 'Dr. Ada Okafor' : 'Ada Okafor';
  const headingText = mode === 'signup' ? 'Create your account' : 'Welcome back';
  const submitLabel = mode === 'signup' ? 'Create Account' : 'Sign In';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>

        {/* Wordmark */}
        <Image
          source={resolveImageSource(wordmark)}
          style={styles.wordmark}
          resizeMode="contain"
        />

        {/* Mode toggle */}
        <View style={styles.toggleContainer}>
          <AnimatedPressable
            onPress={() => switchMode('signup')}
            scaleValue={0.97}
            style={[styles.togglePill, mode === 'signup' && styles.togglePillActive]}
          >
            <Text style={[styles.toggleText, mode === 'signup' && styles.toggleTextActive]}>
              Create Account
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => switchMode('signin')}
            scaleValue={0.97}
            style={[styles.togglePill, mode === 'signin' && styles.togglePillActive]}
          >
            <Text style={[styles.toggleText, mode === 'signin' && styles.toggleTextActive]}>
              Sign In
            </Text>
          </AnimatedPressable>
        </View>

        {/* Heading */}
        <Text style={styles.heading}>{headingText}</Text>

        {/* Form */}
        <View style={styles.form}>
          {/* Full Name — signup only */}
          {mode === 'signup' ? (
            <View style={[styles.inputWrapper, nameFocused && styles.inputWrapperFocused]}>
              <TextInput
                style={styles.input}
                placeholder={namePlaceholder}
                placeholderTextColor="#9CA3AF"
                value={fullName}
                onChangeText={setFullName}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            </View>
          ) : null}

          {/* Email */}
          <View style={[styles.inputWrapper, emailFocused && styles.inputWrapperFocused]}>
            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="ada@example.com"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>

          {/* Password */}
          <View style={[styles.inputWrapper, passwordFocused && styles.inputWrapperFocused]}>
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.inputFlex]}
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            <TouchableOpacity onPress={handleTogglePassword} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Submit button */}
        <AnimatedPressable
          onPress={handleSubmit}
          disabled={loading}
          scaleValue={0.97}
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitLabel}>{submitLabel}</Text>
          )}
        </AnimatedPressable>

        {/* Error */}
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* Footer toggle */}
        <View style={styles.footerRow}>
          {mode === 'signup' ? (
            <>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => switchMode('signin')}>
                <Text style={styles.footerLink}>Sign in</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => switchMode('signup')}>
                <Text style={styles.footerLink}>Create one</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  backChevron: {
    fontSize: 32,
    color: '#111315',
    lineHeight: 36,
  },
  wordmark: {
    width: 140,
    height: 40,
    alignSelf: 'center',
    marginTop: 24,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginTop: 32,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
  },
  togglePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  togglePillActive: {
    backgroundColor: '#111315',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111315',
    marginTop: 24,
  },
  form: {
    marginTop: 24,
    gap: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  inputWrapperFocused: {
    borderColor: '#111315',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111315',
    padding: 0,
    margin: 0,
  },
  inputFlex: {
    flex: 1,
  },
  eyeIcon: {
    fontSize: 18,
    marginLeft: 8,
  },
  submitButton: {
    marginTop: 24,
    backgroundColor: '#111315',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: '#6B7280',
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111315',
  },
});

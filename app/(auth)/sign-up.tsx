import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { AnimatedPressable } from '@/components/AnimatedPressable';

type Mode = 'signup' | 'signin';
type Role = 'doctor' | 'requester';

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
    console.log('[SignUp] Password visibility toggled');
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
        console.log('[SignUp] Sign up success, navigating to OTP verify — email:', email, 'role:', role);
        router.push(`/(auth)/verify?email=${encodeURIComponent(email.trim())}&role=${role}`);
      }
    } else {
      console.log('[SignUp] Sign in pressed — email:', email);
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setLoading(false);
      if (signInError) {
        console.log('[SignUp] Sign in error:', signInError.message);
        setError(signInError.message || 'Sign in failed. Please try again.');
      } else {
        console.log('[SignUp] Sign in success, fetching profile for role-aware routing');
        // Sign-in success — fetch profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role, doctor_onboarding_complete, requester_onboarding_complete')
          .eq('id', data.user.id)
          .single();

        const doctorComplete = profileData?.doctor_onboarding_complete === true;
        const requesterComplete = profileData?.requester_onboarding_complete === true;

        console.log('[SignUp] Profile data — doctorComplete:', doctorComplete, 'requesterComplete:', requesterComplete, 'portal (role param):', role);

        // Portal-vs-role enforcement
        // role = the portal the user entered from ('doctor' = Cover & Earn, 'requester' = Request Coverage)
        if (role === 'doctor' && !doctorComplete && requesterComplete) {
          // They're a requester who tapped the wrong card — silently route to requester portal
          console.log('[SignUp] Cross-portal: doctor portal selected but user is a requester — redirecting to requester portal');
          await SecureStore.setItemAsync('flashlocum_last_pathway', 'requester');
          router.replace('/(requester)/(home)' as any);
          return;
        }

        if (role === 'requester' && !requesterComplete && doctorComplete) {
          // They're a doctor who tapped the wrong card — silently route to doctor portal
          console.log('[SignUp] Cross-portal: requester portal selected but user is a doctor — redirecting to doctor portal');
          await SecureStore.setItemAsync('flashlocum_last_pathway', 'doctor');
          router.replace('/(doctor)/(home)' as any);
          return;
        }

        // Passed validation — write lastPathway to AsyncStorage
        await SecureStore.setItemAsync('flashlocum_last_pathway', role);
        console.log('[SignUp] lastPathway written:', role);

        // Route through intro with destination encoded
        const dest = role === 'doctor'
          ? (doctorComplete ? '/(doctor)/(home)' : '/(onboarding)/doctor/basic-profile')
          : (requesterComplete ? '/(requester)/(home)' : '/(onboarding)/requester/basic-profile');

        console.log('[SignUp] Routing through intro to dest:', dest);
        router.replace(dest as any);
      }
    }
  };

  const namePlaceholder = role === 'doctor' ? 'Dr. Ada Okafor' : 'Ada Okafor';
  const headingText = mode === 'signup' ? 'Create your account' : 'Welcome back';
  const subtitleText = mode === 'signup'
    ? 'Join the FlashLocum coverage network.'
    : 'Sign in to your FlashLocum account.';
  const submitLabel = mode === 'signup' ? 'Create account' : 'Sign in';
  const roleLabel = role === 'requester' ? 'REQUEST COVERAGE' : 'COVER & EARN';
  const isSignup = mode === 'signup';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Custom header bar */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 16 }]}>
        <AnimatedPressable
          onPress={handleBack}
          scaleValue={0.9}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backChevron}>‹</Text>
        </AnimatedPressable>
        <Text style={styles.headerLabel}>{roleLabel}</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Heading block */}
        <View style={styles.headingBlock}>
          <Text style={styles.heading}>{headingText}</Text>
          <Text style={styles.subtitle}>{subtitleText}</Text>
        </View>

        {/* Tab toggle */}
        <View style={styles.toggleTrack}>
          <AnimatedPressable
            onPress={() => switchMode('signup')}
            scaleValue={0.97}
            style={[styles.toggleTab, isSignup && styles.toggleTabActive]}
          >
            <Text style={[styles.toggleTabText, isSignup && styles.toggleTabTextActive]}>
              Create Account
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => switchMode('signin')}
            scaleValue={0.97}
            style={[styles.toggleTab, !isSignup && styles.toggleTabActive]}
          >
            <Text style={[styles.toggleTabText, !isSignup && styles.toggleTabTextActive]}>
              Sign In
            </Text>
          </AnimatedPressable>
        </View>

        {/* Form fields */}
        <View style={styles.form}>
          {/* Full Name — signup only */}
          {isSignup ? (
            <View>
              <Text style={styles.fieldLabel}>Full name</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder={namePlaceholder}
                  placeholderTextColor="#ADADAD"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                />
              </View>
            </View>
          ) : null}

          {/* Email */}
          <View>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.inputContainer}>
              <TextInput
                ref={emailRef}
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#ADADAD"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>
          </View>

          {/* Password */}
          <View>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={[styles.inputContainer, styles.inputContainerRow]}>
              <TextInput
                ref={passwordRef}
                style={[styles.input, styles.inputFlex]}
                placeholder="••••••••"
                placeholderTextColor="#ADADAD"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              <AnimatedPressable
                onPress={handleTogglePassword}
                scaleValue={0.9}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showPassword ? <EyeClosed /> : <EyeOpen />}
              </AnimatedPressable>
            </View>
          </View>
        </View>

        {/* Forgot password — sign in mode only */}
        {!isSignup ? (
          <AnimatedPressable
            onPress={() => {
              console.log('[SignUp] Forgot password pressed — role:', role);
              router.push(`/(auth)/forgot-password?role=${role}` as any);
            }}
            scaleValue={0.97}
            style={styles.forgotWrap}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </AnimatedPressable>
        ) : null}

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

        {/* Legal text — signup only */}
        {isSignup ? (
          <View style={styles.legalContainer}>
            <Text style={styles.legalText}>
              {'By creating an account, you agree to our '}
              <AnimatedPressable
                onPress={() => {
                  console.log('[SignUp] Terms of Service link pressed');
                  router.push('/(auth)/terms' as any);
                }}
                scaleValue={0.97}
              >
                <Text style={styles.legalLink}>Terms of Service</Text>
              </AnimatedPressable>
              {' and '}
              <Text style={styles.legalLink}>Privacy Policy</Text>
              {'.'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: '#F7F7F5',
  },
  backButton: {
    position: 'absolute',
    left: 24,
    bottom: 16,
  },
  backChevron: {
    fontSize: 28,
    color: '#0A0A0A',
    lineHeight: 32,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A8A',
    letterSpacing: 1.5,
  },
  scrollContent: {
    paddingHorizontal: 28,
  },
  headingBlock: {
    marginTop: 8,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#8A8A8A',
    marginTop: 6,
  },
  toggleTrack: {
    flexDirection: 'row',
    marginTop: 28,
    backgroundColor: '#EBEBEB',
    borderRadius: 50,
    padding: 4,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 50,
    alignItems: 'center',
  },
  toggleTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9A9A9A',
  },
  toggleTabTextActive: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  form: {
    marginTop: 28,
    gap: 20,
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
  },
  submitButtonDisabled: {
    opacity: 0.55,
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
    marginTop: 12,
  },
  legalContainer: {
    marginTop: 16,
  },
  legalText: {
    fontSize: 12,
    color: '#ADADAD',
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: {
    textDecorationLine: 'underline',
  },
  forgotWrap: {
    alignItems: 'center',
    marginTop: 8,
  },
  forgotText: {
    fontSize: 14,
    color: '#0A0A0A',
    textDecorationLine: 'underline',
  },
});

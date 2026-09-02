import React, { useState, useRef, useReducer } from 'react';
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Svg, { Path } from 'react-native-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';

type Mode = 'signup' | 'signin';
type Role = 'doctor' | 'requester';

type FormState = {
  fullName: string;
  email: string;
  password: string;
  showPassword: boolean;
  error: string;
};

const initialFormState: FormState = {
  fullName: '',
  email: '',
  password: '',
  showPassword: false,
  error: '',
};

type FormAction =
  | { type: 'SET_FULL_NAME'; value: string }
  | { type: 'SET_EMAIL'; value: string }
  | { type: 'SET_PASSWORD'; value: string }
  | { type: 'TOGGLE_PASSWORD' }
  | { type: 'SET_ERROR'; value: string }
  | { type: 'CLEAR' };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FULL_NAME': return { ...state, fullName: action.value };
    case 'SET_EMAIL': return { ...state, email: action.value };
    case 'SET_PASSWORD': return { ...state, password: action.value };
    case 'TOGGLE_PASSWORD': return { ...state, showPassword: !state.showPassword };
    case 'SET_ERROR': return { ...state, error: action.value };
    case 'CLEAR': return initialFormState;
    default: return state;
  }
}

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
  const { signOut } = useAuth();
  const params = useLocalSearchParams<{ role?: string; mode?: string }>();

  const initialMode: Mode = params.mode === 'signin' ? 'signin' : 'signup';
  const initialRole: Role = params.role === 'doctor' ? 'doctor' : 'requester';

  const [mode, setMode] = useState<Mode>(initialMode);
  const [role] = useState<Role>(initialRole);

  const [form, dispatch] = useReducer(formReducer, initialFormState);
  const [loading, setLoading] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const switchMode = (next: Mode) => {
    dispatch({ type: 'CLEAR' });
    setMode(next);
  };

  const handleBack = () => {
    router.back();
  };

  const handleTogglePassword = () => {
    dispatch({ type: 'TOGGLE_PASSWORD' });
  };

  const handleSubmit = async () => {
    if (loading) return;

    if (!form.email.trim() || !form.password.trim()) {
      dispatch({ type: 'SET_ERROR', value: 'Please fill in all fields.' });
      return;
    }
    if (mode === 'signup' && !form.fullName.trim()) {
      dispatch({ type: 'SET_ERROR', value: 'Please enter your full name.' });
      return;
    }

    setLoading(true);
    dispatch({ type: 'SET_ERROR', value: '' });

    if (mode === 'signup') {
      console.log('[sign-up] Sign up submitted', { email: form.email.trim(), role });
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            full_name: form.fullName.trim(),
            first_name: form.fullName.trim().split(' ')[0] ?? '',
            last_name: form.fullName.trim().split(' ').slice(1).join(' ') || (form.fullName.trim().split(' ')[0] ?? ''),
            role,
          },
        },
      });
      setLoading(false);
      if (signUpError) {
        dispatch({ type: 'SET_ERROR', value: signUpError.message || 'Sign up failed. Please try again.' });
        const signUpMsg = signUpError.message ?? '';
        const isExpectedSignUpError = (msg: string) => {
          const m = msg.toLowerCase();
          return m.includes('already registered') || m.includes('already exists') || m.includes('email taken');
        };
        if (!isExpectedSignUpError(signUpMsg)) {
          // unexpected sign-up error — no logging
        }
      } else {
        router.push(`/(auth)/verify?email=${encodeURIComponent(form.email.trim())}&role=${role}`);
      }
    } else {
      console.log('[sign-up] Sign in submitted', { email: form.email.trim(), role });
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      setLoading(false);
      if (signInError) {
        dispatch({ type: 'SET_ERROR', value: signInError.message || 'Sign in failed. Please try again.' });
        const signInMsg = signInError.message ?? '';
        const isExpectedSignInError = (msg: string) => {
          const m = msg.toLowerCase();
          return (
            m.includes('invalid login') ||
            m.includes('invalid credentials') ||
            m.includes('wrong password') ||
            m.includes('email not confirmed')
          );
        };
        if (!isExpectedSignInError(signInMsg)) {
          // unexpected sign-in error — no logging
        }
      } else {
        // Fetch profile to determine correct destination
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        // Portal eligibility check
        if (role === 'doctor' && profileData?.doctor_onboarding_complete !== true && profileData?.requester_onboarding_complete === true) {
          console.log('[sign-up] Portal mismatch: doctor portal attempted by requester account', { userId: data.user.id });
          await supabase.auth.signOut();
          dispatch({ type: 'SET_ERROR', value: 'This account is registered as a Requester. Please sign in through the Requester portal.' });
          return;
        }
        if (role === 'requester' && profileData?.requester_onboarding_complete !== true && profileData?.doctor_onboarding_complete === true) {
          console.log('[sign-up] Portal mismatch: requester portal attempted by doctor account', { userId: data.user.id });
          await supabase.auth.signOut();
          dispatch({ type: 'SET_ERROR', value: 'This account is registered as a Doctor. Please sign in through the Doctor portal.' });
          return;
        }

        await SecureStore.setItemAsync('flashlocum_last_pathway', role);
        if (!profileData) {
          // No profile yet — go to onboarding
          console.log('[sign-up] No profile found, routing to onboarding', { role });
          if (role === 'doctor') {
            router.replace('/(onboarding)/doctor/basic-profile' as any);
          } else {
            router.replace('/(onboarding)/requester/basic-profile' as any);
          }
          return;
        }
        const doctorComplete = profileData.doctor_onboarding_complete === true;
        const requesterComplete = profileData.requester_onboarding_complete === true;
        console.log('[sign-up] Routing after sign-in', { role, doctorComplete, requesterComplete });
        if (doctorComplete && !requesterComplete) {
          router.replace('/(doctor)/(home)' as any);
        } else if (requesterComplete && !doctorComplete) {
          router.replace('/(requester)/(home)' as any);
        } else if (doctorComplete && requesterComplete) {
          const dest = role === 'doctor' ? '/(doctor)/(home)' : '/(requester)/(home)';
          router.replace(dest as any);
        } else if (role === 'requester') {
          // Requester onboarding — single step, always go to basic-profile
          router.replace('/(onboarding)/requester/basic-profile' as any);
        } else {
          // Doctor onboarding — detect which step to resume
          console.log('[sign-up] Doctor onboarding incomplete, detecting resume step', { userId: data.user.id });
          try {
            const [profileStepResult, doctorProfileResult] = await Promise.all([
              supabase.from('profiles').select('doctor_basic_profile_complete').eq('id', data.user.id).single(),
              supabase.from('doctor_profiles').select('mdcn_number, account_number').eq('id', data.user.id).single(),
            ]);
            const profileStep = profileStepResult.data;
            const doctorStep = doctorProfileResult.data;

            if (!profileStep || profileStep.doctor_basic_profile_complete !== true) {
              console.log('[sign-up] Routing to doctor basic-profile (step 1)');
              router.replace('/(onboarding)/doctor/basic-profile' as any);
            } else if (!doctorStep?.mdcn_number) {
              console.log('[sign-up] Routing to doctor credentials (step 2)');
              router.replace('/(onboarding)/doctor/credentials' as any);
            } else if (!doctorStep?.account_number) {
              console.log('[sign-up] Routing to doctor payout (step 3)');
              router.replace('/(onboarding)/doctor/payout' as any);
            } else {
              // All three step-fields are set but doctor_onboarding_complete was not written.
              // This is an interrupted-payout state. Resume at payout so the flag gets written.
              // Do NOT send back to Basic Profile — Step 1 is positively confirmed complete.
              console.log('[sign-up] All step fields set, flag not written — resuming at payout');
              router.replace('/(onboarding)/doctor/payout' as any);
            }
          } catch (err) {
            // Step detection query failed — we cannot determine onboarding state.
            // Route to role-select. Do NOT infer that Basic Profile is incomplete from a failed query.
            console.log('[sign-up] Step detection query failed — routing to role-select', err);
            router.replace('/(auth)/role-select' as any);
          }
        }
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
  const { fullName, email, password, showPassword, error } = form;

  return (
    <View style={styles.flex}>
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

      <KeyboardAwareScrollView
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
            scaleValue={0.93}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={[styles.toggleTab, isSignup && styles.toggleTabActive]}
          >
            <Text style={[styles.toggleTabText, isSignup && styles.toggleTabTextActive]}>
              Create Account
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => switchMode('signin')}
            scaleValue={0.93}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
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
                  onChangeText={value => dispatch({ type: 'SET_FULL_NAME', value })}
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
                placeholder="name@mail.com"
                placeholderTextColor="#ADADAD"
                value={email}
                onChangeText={value => dispatch({ type: 'SET_EMAIL', value })}
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
                onChangeText={value => dispatch({ type: 'SET_PASSWORD', value })}
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
              <Text style={styles.legalLink} onPress={() => router.push('/(auth)/terms' as any)}>
                Terms of Service
              </Text>
              {' and '}
              <Text style={styles.legalLink} onPress={() => router.push('/(auth)/privacy' as any)}>
                Privacy Policy
              </Text>
              {'.'}
            </Text>
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
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
    alignItems: 'flex-end',
    marginTop: 8,
    paddingHorizontal: 24,
  },
  forgotText: {
    fontSize: 14,
    color: '#0A0A0A',
    textDecorationLine: 'underline',
  },
});

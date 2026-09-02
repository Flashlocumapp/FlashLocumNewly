import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const LAST_PATHWAY_KEY = 'flashlocum_last_pathway';

export function usePathwayGuard() {
  const { profile, user } = useAuth();
  const router = useRouter();

  const canAccessDoctor = profile?.doctor_onboarding_complete === true;
  const canAccessRequester = profile?.requester_onboarding_complete === true;

  const enterDoctor = () => {
    SecureStore.setItemAsync(LAST_PATHWAY_KEY, 'doctor').catch(() => {});
    if (!canAccessDoctor) {
      // Async step detection — navigate to the correct incomplete step
      const detectStep = async () => {
        const userId = user?.id;
        if (!userId) {
          // No authenticated user — cannot determine onboarding state.
          // Route to role-select, not Basic Profile.
          console.log('[usePathwayGuard] enterDoctor: no user id — routing to role-select');
          router.push('/(auth)/role-select' as any);
          return;
        }

        try {
          const [profileResult, doctorProfileResult] = await Promise.all([
            supabase
              .from('profiles')
              .select('doctor_basic_profile_complete')
              .eq('id', userId)
              .single(),
            supabase
              .from('doctor_profiles')
              // account_number is the authoritative Step 3 signal for navigation.
              // subaccount_code is a payment-infrastructure field and must NOT be used here.
              .select('mdcn_number, account_number')
              .eq('id', userId)
              .single(),
          ]);

          // Any query error → unknown state → role-select.
          // Do NOT infer that Basic Profile is incomplete from a failed query.
          if (profileResult.error || doctorProfileResult.error) {
            console.log('[usePathwayGuard] enterDoctor: query error — routing to role-select', {
              profileError: profileResult.error?.message,
              doctorProfileError: doctorProfileResult.error?.message,
            });
            router.push('/(auth)/role-select' as any);
            return;
          }

          const profileData = profileResult.data;
          const doctorData = doctorProfileResult.data;

          if (!profileData || profileData.doctor_basic_profile_complete !== true) {
            // Step 1 positively not complete
            console.log('[usePathwayGuard] enterDoctor: routing to basic-profile (step 1)');
            router.push('/(onboarding)/doctor/basic-profile' as any);
          } else if (!doctorData?.mdcn_number) {
            // Step 1 complete, Step 2 not complete
            console.log('[usePathwayGuard] enterDoctor: routing to credentials (step 2)');
            router.push('/(onboarding)/doctor/credentials' as any);
          } else if (!doctorData?.account_number) {
            // Steps 1+2 complete, Step 3 not complete
            console.log('[usePathwayGuard] enterDoctor: routing to payout (step 3)');
            router.push('/(onboarding)/doctor/payout' as any);
          } else {
            // All three step-fields are set but doctor_onboarding_complete is still false.
            // This is an interrupted-payout state (crash between writing account_number and
            // writing doctor_onboarding_complete). Resume at payout to complete the flag write.
            // Do NOT send back to Basic Profile — Step 1 is positively confirmed complete.
            console.log('[usePathwayGuard] enterDoctor: all fields set, flag not written — resuming at payout');
            router.push('/(onboarding)/doctor/payout' as any);
          }
        } catch (err) {
          // Unexpected error during step detection — cannot determine onboarding state.
          // Route to role-select. Do NOT infer that Basic Profile is incomplete from an error.
          console.log('[usePathwayGuard] enterDoctor: unexpected error — routing to role-select', err);
          router.push('/(auth)/role-select' as any);
        }
      };
      detectStep();
    } else {
      router.push('/(doctor)/(home)' as any);
    }
  };

  const enterRequester = () => {
    SecureStore.setItemAsync(LAST_PATHWAY_KEY, 'requester').catch(() => {});
    if (!canAccessRequester) {
      router.push('/(onboarding)/requester/basic-profile' as any);
    } else {
      router.push('/(requester)/(home)' as any);
    }
  };

  return { canAccessDoctor, canAccessRequester, enterDoctor, enterRequester };
}

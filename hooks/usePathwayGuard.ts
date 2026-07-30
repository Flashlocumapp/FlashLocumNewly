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
        try {
          const userId = user?.id;
          if (!userId) {
            console.log('[usePathwayGuard] enterDoctor: no user id, routing to basic-profile');
            router.push('/(onboarding)/doctor/basic-profile' as any);
            return;
          }

          const [profileResult, doctorProfileResult] = await Promise.all([
            supabase.from('profiles').select('doctor_basic_profile_complete').eq('id', userId).single(),
            supabase.from('doctor_profiles').select('mdcn_number, subaccount_code').eq('id', userId).single(),
          ]);

          const profileData = profileResult.data;
          const doctorData = doctorProfileResult.data;

          if (!profileData || profileData.doctor_basic_profile_complete !== true) {
            console.log('[usePathwayGuard] enterDoctor: routing to basic-profile (step 1)');
            router.push('/(onboarding)/doctor/basic-profile' as any);
          } else if (!doctorData?.mdcn_number) {
            console.log('[usePathwayGuard] enterDoctor: routing to credentials (step 2)');
            router.push('/(onboarding)/doctor/credentials' as any);
          } else if (!doctorData?.subaccount_code) {
            console.log('[usePathwayGuard] enterDoctor: routing to payout (step 3)');
            router.push('/(onboarding)/doctor/payout' as any);
          } else {
            console.log('[usePathwayGuard] enterDoctor: fallback to basic-profile');
            router.push('/(onboarding)/doctor/basic-profile' as any);
          }
        } catch (err) {
          console.log('[usePathwayGuard] enterDoctor: step detection error, routing to basic-profile', err);
          router.push('/(onboarding)/doctor/basic-profile' as any);
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

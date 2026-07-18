import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/contexts/AuthContext';

const LAST_PATHWAY_KEY = 'flashlocum_last_pathway';

export function usePathwayGuard() {
  const { profile } = useAuth();
  const router = useRouter();

  const canAccessDoctor = profile?.doctor_onboarding_complete === true;
  const canAccessRequester = profile?.requester_onboarding_complete === true;

  const enterDoctor = () => {
    SecureStore.setItemAsync(LAST_PATHWAY_KEY, 'doctor').catch(() => {});
    if (!canAccessDoctor) {
      router.push('/(onboarding)/doctor/basic-profile' as any);
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

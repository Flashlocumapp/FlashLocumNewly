import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

export function usePathwayGuard() {
  const { profile } = useAuth();
  const router = useRouter();

  const canAccessDoctor = profile?.doctor_onboarding_complete === true;
  const canAccessRequester = profile?.requester_onboarding_complete === true;

  const enterDoctor = () => {
    console.log('[usePathwayGuard] enterDoctor — canAccessDoctor:', canAccessDoctor);
    if (!canAccessDoctor) {
      router.push('/(onboarding)/doctor/basic-profile' as any);
    } else {
      router.push('/(app)/(shifts)' as any);
    }
  };

  const enterRequester = () => {
    console.log('[usePathwayGuard] enterRequester — canAccessRequester:', canAccessRequester);
    if (!canAccessRequester) {
      router.push('/(onboarding)/requester/basic-profile' as any);
    } else {
      router.push('/(app)/(shifts)' as any);
    }
  };

  return { canAccessDoctor, canAccessRequester, enterDoctor, enterRequester };
}

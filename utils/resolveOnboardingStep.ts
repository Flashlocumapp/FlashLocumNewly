import { supabase } from '@/lib/supabase';

/**
 * Determines which Doctor onboarding step a user should resume at.
 *
 * Authoritative signals:
 *   Step 1 complete  → profiles.doctor_basic_profile_complete === true
 *   Step 2 complete  → doctor_profiles.mdcn_number is non-null/non-empty
 *   Step 3 complete  → doctor_profiles.account_number is non-null/non-empty
 *   All complete     → profiles.doctor_onboarding_complete === true
 *
 * Returns:
 *   'home'          — doctor_onboarding_complete is true → Doctor Home
 *   'basic-profile' — Step 1 not confirmed complete
 *   'credentials'   — Step 1 done, Step 2 not done
 *   'payout'        — Steps 1+2 done, Step 3 not done OR all fields set but flag not written
 *   'unknown'       — any query failed; caller must route to role-select, never to Basic Profile
 *
 * INVARIANT: 'unknown' must never be interpreted as "Basic Profile incomplete".
 * A query failure is not evidence that an onboarding step is incomplete.
 */
export type OnboardingStep = 'home' | 'basic-profile' | 'credentials' | 'payout' | 'unknown';

export async function resolveOnboardingStep(userId: string): Promise<OnboardingStep> {
  try {
    const [profileResult, doctorProfileResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('doctor_basic_profile_complete, doctor_onboarding_complete')
        .eq('id', userId)
        .single(),
      supabase
        .from('doctor_profiles')
        .select('mdcn_number, account_number')
        .eq('id', userId)
        .single(),
    ]);

    // Any query error → unknown (do not infer incomplete step from failure)
    if (profileResult.error || doctorProfileResult.error) {
      console.warn('[resolveOnboardingStep] Query error — returning unknown', {
        profileError: profileResult.error?.message,
        doctorProfileError: doctorProfileResult.error?.message,
      });
      return 'unknown';
    }

    const p = profileResult.data;
    const d = doctorProfileResult.data;

    // Authoritative completion flag — check first
    if (p?.doctor_onboarding_complete === true) return 'home';

    // Step 1 — Basic Profile
    if (!p?.doctor_basic_profile_complete) return 'basic-profile';

    // Step 2 — Credentials
    if (!d?.mdcn_number) return 'credentials';

    // Step 3 — Payout
    // Also handles the interrupted-payout state where account_number is set
    // but doctor_onboarding_complete was never written — resume at payout to complete.
    if (!d?.account_number) return 'payout';

    // All three step-fields are set but doctor_onboarding_complete is still false.
    // This is an interrupted-payout state. Resume at payout so the flag gets written.
    return 'payout';
  } catch (err) {
    console.warn('[resolveOnboardingStep] Unexpected error — returning unknown', err);
    return 'unknown';
  }
}

/**
 * Variant for use in NavigationGuard when the main profile has already been
 * successfully fetched and doctor_basic_profile_complete is already known.
 * Only queries doctor_profiles to determine Step 2/3 status.
 *
 * Returns 'credentials', 'payout', or 'unknown'.
 * Never returns 'home' or 'basic-profile' — caller already handled those.
 */
export async function resolveOnboardingStepFromCredentials(userId: string): Promise<'credentials' | 'payout' | 'unknown'> {
  try {
    const { data, error } = await supabase
      .from('doctor_profiles')
      .select('mdcn_number, account_number')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('[resolveOnboardingStep] doctor_profiles query error — returning unknown', error.message);
      return 'unknown';
    }

    if (!data?.mdcn_number) return 'credentials';
    // account_number missing OR all fields set but flag not written → payout
    return 'payout';
  } catch (err) {
    console.warn('[resolveOnboardingStep] Unexpected error — returning unknown', err);
    return 'unknown';
  }
}

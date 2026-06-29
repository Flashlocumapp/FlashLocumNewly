import { Session, User } from '@supabase/supabase-js';

export type { Session, User };

export interface Profile {
  id: string;
  role: 'doctor' | 'requester' | null;
  onboarding_complete: boolean;
  doctor_onboarding_complete: boolean;
  requester_onboarding_complete: boolean;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  gender: 'male' | 'female' | null;
  created_at: string;
  updated_at: string;
}

export interface AuthContextType {
  session: import('@supabase/supabase-js').Session | null;
  user: import('@supabase/supabase-js').User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: import('@supabase/supabase-js').AuthError | null }>;
  signUp: (email: string, password: string, metadata?: Record<string, string>) => Promise<{ error: import('@supabase/supabase-js').AuthError | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

import { Session, User } from '@supabase/supabase-js';

export type PaymentIntent = {
  id: string;
  session_id: string;
  amount_naira: number;
  monnify_account_number: string | null;
  monnify_bank_name: string | null;
  monnify_account_reference: string | null;
  monnify_transaction_reference: string | null;
  status: 'pending' | 'expired' | 'paid';
  expiry_at: string; // ISO 8601
  created_at: string;
  updated_at: string;
};

export type { Session, User };

export interface Profile {
  id: string;
  role: 'doctor' | 'requester' | null;
  onboarding_complete: boolean;
  doctor_onboarding_complete: boolean;
  doctor_basic_profile_complete: boolean;
  requester_onboarding_complete: boolean;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  gender: 'male' | 'female' | null;
  created_at: string;
  updated_at: string;
}

export type DoctorEarning = {
  session_id: string;
  doctor_id: string;
  requester_id: string;
  session_status: string;
  coverage_type: string;
  coverage_length: number;
  per_day_hours: number;
  start_time: string;
  end_time: string;
  total_amount_naira: number;
  platform_fee_naira: number;
  net_payout_naira: number;
  payment_status: string | null;
  monnify_account_reference: string | null;
  monnify_transaction_reference: string | null;
  disbursement_reference: string | null;
  disbursed_at: string | null;
  paid_at: string | null;
  hospital_name?: string;
};

export interface AuthContextType {
  session: import('@supabase/supabase-js').Session | null;
  user: import('@supabase/supabase-js').User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  isReady: boolean;
  signIn: (email: string, password: string) => Promise<{ error: import('@supabase/supabase-js').AuthError | null }>;
  signUp: (email: string, password: string, metadata?: Record<string, string>) => Promise<{ error: import('@supabase/supabase-js').AuthError | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

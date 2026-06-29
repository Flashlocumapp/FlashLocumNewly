import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from './types';
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://juilousufwlsiqdcgllu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1aWxvdXN1Zndsc2lxZGNnbGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MjE1MTEsImV4cCI6MjA5ODI5NzUxMX0.XOE0UTfZrfLp_giDlGkBsffhRBhVT1njaETm7vtmTxA";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

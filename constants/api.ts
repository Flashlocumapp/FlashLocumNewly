import Constants from 'expo-constants';

export const SUPABASE_URL: string =
  (Constants.expoConfig?.extra?.supabaseUrl as string) ??
  (() => { throw new Error('supabaseUrl not set in app.json extra'); })();

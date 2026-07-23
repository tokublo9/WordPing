import { createClient, type Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (__DEV__ && !isSupabaseConfigured) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY — check your .env file');
}

// Keep Supabase optional at module-evaluation time. createClient throws for an
// empty URL, which previously meant a missing optional sync configuration could
// prevent the entire app from launching.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

let sessionRequest: Promise<Session> | null = null;

/** Return the current anonymous session, creating it once when necessary. */
export async function requireSupabaseSession(): Promise<Session> {
  if (!supabase) throw new Error('service_unavailable');

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('authentication_failed');
  if (data.session) return data.session;

  if (!sessionRequest) {
    sessionRequest = supabase.auth.signInAnonymously().then(({ data: signInData, error: signInError }) => {
      if (signInError || !signInData.session) throw new Error('authentication_failed');
      return signInData.session;
    }).finally(() => {
      sessionRequest = null;
    });
  }

  return sessionRequest;
}

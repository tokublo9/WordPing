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
let cachedSession: Session | null | undefined;

supabase?.auth.onAuthStateChange((_event, session) => {
  cachedSession = session;
});

function sessionIsUsable(session: Session | null | undefined): session is Session {
  if (!session) return false;
  return !session.expires_at || session.expires_at * 1000 > Date.now() + 30_000;
}

/** Return the current anonymous session, creating it once when necessary. */
export async function requireSupabaseSession(): Promise<Session> {
  if (!supabase) throw new Error('service_unavailable');

  if (sessionIsUsable(cachedSession)) return cachedSession;

  if (sessionRequest) return sessionRequest;

  sessionRequest = (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error('authentication_failed');
    if (sessionIsUsable(data.session)) {
      cachedSession = data.session;
      return data.session;
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError || !signInData.session) throw new Error('authentication_failed');
    cachedSession = signInData.session;
    return signInData.session;
  })().finally(() => {
    sessionRequest = null;
  });

  return sessionRequest;
}

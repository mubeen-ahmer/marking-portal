import { createClient } from '@supabase/supabase-js';

/**
 * Creates a new auth user via GoTrue without affecting the current session.
 * Uses an isolated Supabase client so the admin doesn't get logged out.
 */
export async function createAuthUser(email, password) {
  // Isolated client — same anon key, separate session
  const isolated = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await isolated.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('User creation failed');
  return data.user.id;
}

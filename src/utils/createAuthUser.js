import { createClient } from '@supabase/supabase-js';

/**
 * Singleton admin client using the service role key.
 * This bypasses email confirmation and RLS policies entirely.
 * NEVER expose this key on a public/client-facing endpoint.
 */
let _adminClient = null;
function getAdminClient() {
  if (!_adminClient) {
    _adminClient = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _adminClient;
}

/**
 * Creates a new auth user via the Admin API without affecting the current session.
 * Uses admin.createUser so email confirmation is skipped automatically.
 */
export async function createAuthUser(email, password) {
  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // mark as already confirmed
  });
  if (error) throw error;
  if (!data.user) throw new Error('User creation failed');
  return data.user.id;
}

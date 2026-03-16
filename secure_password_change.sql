-- ============================================================
-- Secure Password Change Function
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Allows users to change their own password ONLY IF they know the old password.
-- Required because 'Secure Password Change' blocks updateUser for imaginary emails,
-- and default updateUser without it doesn't verify the old password!
create or replace function public.change_my_password(p_old_password text, p_new_password text)
returns void
language plpgsql
security definer
as $$
declare
  v_user auth.users;
begin
  -- 1. Get the current user from the auth system
  select * into v_user from auth.users where id = auth.uid();
  
  if not found then
    raise exception 'Not authenticated';
  end if;

  -- 2. Verify the old password matches the encrypted hash in the database
  if v_user.encrypted_password != crypt(p_old_password, v_user.encrypted_password) then
    raise exception 'Incorrect current password';
  end if;

  -- 3. Update the password hash directly (bypassing normal GoTrue update flow)
  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf'))
  where id = auth.uid();
  
end;
$$;

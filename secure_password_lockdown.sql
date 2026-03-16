-- ============================================================
-- THE ULTIMATE PASSWORD LOCKDOWN
-- Run this in your Supabase SQL Editor
--
-- This script permanently blocks Supabase's default /user API from
-- changing passwords by adding a database trigger that ONLY allows
-- our custom secure functions to update the password hash.
-- ============================================================

-- 1. Create a trigger function that blocks unauthorized password updates
create or replace function public.tr_block_insecure_password_update()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only trigger if the password hash has actually changing
  if new.encrypted_password is distinct from old.encrypted_password then
    -- Check if the update is coming from our own custom RPCs (they set this flag)
    -- current_setting() throws an error if missing, so we supply 'true' for missing_ok
    if current_setting('edumark.secure_password_change_allowed', true) is distinct from 'true' then
      -- If the flag is MISSING or false, the request came from the Supabase API! Block it!
      raise exception 'SECURITY ALERT: Direct API password changes are blocked! You must use the secure RPC functions.';
    end if;
  end if;
  return new;
end;
$$;

-- 2. Attach the trigger to the auth.users table BEFORE updates
drop trigger if exists tr_secure_password on auth.users;
create trigger tr_secure_password
  before update on auth.users
  for each row
  execute function public.tr_block_insecure_password_update();

-- ============================================================
-- 3. Replace the Student/Teacher secure change function to use the flag
-- ============================================================
create or replace function public.change_my_password(p_old_password text, p_new_password text)
returns void
language plpgsql
security definer
as $$
declare
  v_user auth.users;
begin
  select * into v_user from auth.users where id = auth.uid();
  
  if not found then
    raise exception 'Not authenticated';
  end if;

  if v_user.encrypted_password != crypt(p_old_password, v_user.encrypted_password) then
    raise exception 'Incorrect current password';
  end if;

  -- TELL THE TRIGGER: "This update is authorized by EduMark, allow it."
  perform set_config('edumark.secure_password_change_allowed', 'true', true);

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf'))
  where id = auth.uid();
end;
$$;

-- ============================================================
-- 4. Replace the Admin reset function to use the flag
-- ============================================================
create or replace function public.admin_reset_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
as $$
begin
  if public.get_my_role() != 'admin' then
    raise exception 'Admin access required';
  end if;

  -- TELL THE TRIGGER: "This update is authorized by an Admin, allow it."
  perform set_config('edumark.secure_password_change_allowed', 'true', true);

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf'))
  where id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

-- ============================================================
-- Admin Password Reset Function
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Allows admin to reset any user's password directly
-- (needed because student emails like na26001@student.local are imaginary)
create or replace function public.admin_reset_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
as $$
begin
  -- Only admins can reset passwords
  if public.get_my_role() != 'admin' then
    raise exception 'Admin access required';
  end if;

  -- Update the password hash directly in auth.users
  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf'))
  where id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

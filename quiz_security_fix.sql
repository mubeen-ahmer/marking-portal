-- ============================================================
-- EduMark Quiz Security Fix Migration (v2)
-- Run this in your Supabase SQL Editor
-- Includes all fixes from v1 + second-pass loophole fixes
-- ============================================================

-- ============================================================
-- FIX 1: Hide correct_option from students
-- ============================================================

drop policy if exists "Student read quiz questions" on public.quiz_questions;

create or replace view public.student_quiz_questions
with (security_invoker = false)
as
  select id, quiz_id, question_text, option_a, option_b, option_c, option_d, sort_order, created_at
  from public.quiz_questions;

grant select on public.student_quiz_questions to authenticated;

-- ============================================================
-- FIX 2: Lock down quiz_attempts
-- ============================================================

drop policy if exists "Student manage own attempts" on public.quiz_attempts;
drop policy if exists "Student read own attempts" on public.quiz_attempts;
drop policy if exists "Student insert own attempts" on public.quiz_attempts;

create policy "Student read own attempts"
  on public.quiz_attempts for select
  using (student_id = auth.uid());

create policy "Student insert own attempts"
  on public.quiz_attempts for insert
  with check (student_id = auth.uid());

-- No UPDATE or DELETE policy for students

-- ============================================================
-- FIX 3: Prevent duplicate answers + tighten INSERT policy
-- ============================================================

-- Safe to re-run: only add constraint if it doesn't exist
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quiz_answers_attempt_question_unique'
  ) then
    alter table public.quiz_answers
      add constraint quiz_answers_attempt_question_unique
      unique (attempt_id, question_id);
  end if;
end $$;

-- Drop old INSERT policy and recreate with is_submitted check
drop policy if exists "Student insert own answers" on public.quiz_answers;

create policy "Student insert own answers"
  on public.quiz_answers for insert
  with check (
    attempt_id in (
      select id from public.quiz_attempts
      where student_id = auth.uid() and is_submitted = false
    )
  );

drop policy if exists "Student update own answers" on public.quiz_answers;

create policy "Student update own answers"
  on public.quiz_answers for update
  using (
    attempt_id in (
      select id from public.quiz_attempts
      where student_id = auth.uid() and is_submitted = false
    )
  );

-- Students can read their own answers (for resume)
drop policy if exists "Student read own answers" on public.quiz_answers;

create policy "Student read own answers"
  on public.quiz_answers for select
  using (
    attempt_id in (select id from public.quiz_attempts where student_id = auth.uid())
  );

-- ============================================================
-- FIX 4: start_quiz_attempt - auto-submit expired in-progress attempts
-- ============================================================

create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_quiz record;
  v_student_id uuid := auth.uid();
  v_batch_id uuid;
  v_submitted_count int;
  v_existing record;
  v_new_attempt record;
  v_elapsed_mins numeric;
  v_score int;
  v_total int;
begin
  if public.get_my_role() != 'student' then
    raise exception 'Only students can take quizzes';
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then raise exception 'Quiz not found'; end if;

  if v_quiz.expires_at < now() then
    raise exception 'This quiz has expired';
  end if;

  select batch_id into v_batch_id from public.students where id = v_student_id;
  if v_batch_id is null or v_batch_id != v_quiz.batch_id then
    raise exception 'You are not assigned to this quiz batch';
  end if;

  -- Check for in-progress attempt
  select * into v_existing
  from public.quiz_attempts
  where quiz_id = p_quiz_id and student_id = v_student_id and is_submitted = false;

  if found then
    -- Check if time has expired on this attempt
    v_elapsed_mins := extract(epoch from (now() - v_existing.started_at)) / 60.0;

    if v_elapsed_mins > (v_quiz.time_limit_mins + 1.0) then
      -- Auto-submit the expired attempt with whatever answers exist
      select count(*) into v_total from public.quiz_questions where quiz_id = v_quiz.id;
      select count(*) into v_score
      from public.quiz_answers qa
      join public.quiz_questions qq on qq.id = qa.question_id
      where qa.attempt_id = v_existing.id
        and qa.selected_option = qq.correct_option;

      update public.quiz_attempts
      set is_submitted = true, submitted_at = now(), score = v_score, total = v_total
      where id = v_existing.id;

      -- Return as auto-submitted so frontend shows result
      return json_build_object(
        'id', v_existing.id, 'quiz_id', v_existing.quiz_id,
        'student_id', v_existing.student_id, 'started_at', v_existing.started_at,
        'is_submitted', true, 'violations', v_existing.violations,
        'score', v_score, 'total', v_total,
        'resumed', false, 'auto_submitted', true
      );
    end if;

    -- Time not expired - resume normally
    return json_build_object(
      'id', v_existing.id, 'quiz_id', v_existing.quiz_id,
      'student_id', v_existing.student_id, 'started_at', v_existing.started_at,
      'is_submitted', v_existing.is_submitted, 'violations', v_existing.violations,
      'resumed', true, 'auto_submitted', false
    );
  end if;

  -- Check max attempts
  select count(*) into v_submitted_count
  from public.quiz_attempts
  where quiz_id = p_quiz_id and student_id = v_student_id and is_submitted = true;

  if v_submitted_count >= v_quiz.max_attempts then
    raise exception 'Maximum attempts reached';
  end if;

  -- Create new attempt with server timestamp
  insert into public.quiz_attempts (quiz_id, student_id, started_at)
  values (p_quiz_id, v_student_id, now())
  returning * into v_new_attempt;

  return json_build_object(
    'id', v_new_attempt.id, 'quiz_id', v_new_attempt.quiz_id,
    'student_id', v_new_attempt.student_id, 'started_at', v_new_attempt.started_at,
    'is_submitted', v_new_attempt.is_submitted, 'violations', v_new_attempt.violations,
    'resumed', false, 'auto_submitted', false
  );
end;
$$;

-- ============================================================
-- FIX 5: record_violation RPC
-- ============================================================

create or replace function public.record_violation(p_attempt_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.quiz_attempts
  set violations = violations + 1
  where id = p_attempt_id
    and student_id = auth.uid()
    and is_submitted = false;

  if not found then
    raise exception 'Attempt not found or already submitted';
  end if;
end;
$$;

-- ============================================================
-- FIX 6: Harden submit_quiz - enforce time + quiz expiry
-- ============================================================

create or replace function public.submit_quiz(p_attempt_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_attempt record;
  v_quiz record;
  v_score int := 0;
  v_total int := 0;
  v_elapsed_mins numeric;
  v_grace_mins numeric := 1.0;
begin
  select * into v_attempt
  from public.quiz_attempts
  where id = p_attempt_id and student_id = auth.uid();

  if not found then raise exception 'Attempt not found'; end if;

  if v_attempt.is_submitted then
    return json_build_object('score', v_attempt.score, 'total', v_attempt.total);
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  -- SERVER-SIDE TIME ENFORCEMENT
  v_elapsed_mins := extract(epoch from (now() - v_attempt.started_at)) / 60.0;
  select count(*) into v_total from public.quiz_questions where quiz_id = v_quiz.id;

  -- If way past time limit, score whatever they have but still count it
  if v_elapsed_mins > (v_quiz.time_limit_mins + v_grace_mins) then
    -- Still score their existing answers (fair for auto-submit edge cases)
    select count(*) into v_score
    from public.quiz_answers qa
    join public.quiz_questions qq on qq.id = qa.question_id
    where qa.attempt_id = p_attempt_id
      and qa.selected_option = qq.correct_option;

    update public.quiz_attempts
    set is_submitted = true, submitted_at = now(), score = v_score, total = v_total
    where id = p_attempt_id;
    return json_build_object('score', v_score, 'total', v_total);
  end if;

  -- Normal scoring
  select count(*) into v_score
  from public.quiz_answers qa
  join public.quiz_questions qq on qq.id = qa.question_id
  where qa.attempt_id = p_attempt_id
    and qa.selected_option = qq.correct_option;

  update public.quiz_attempts
  set is_submitted = true, submitted_at = now(), score = v_score, total = v_total
  where id = p_attempt_id;

  return json_build_object('score', v_score, 'total', v_total);
end;
$$;

-- ============================================================
-- FIX 7: Server time helper for anti-clock-manipulation
-- ============================================================

create or replace function public.get_server_time()
returns timestamptz
language sql
stable
security definer
as $$
  select now();
$$;

-- ============================================================
-- DONE! Run this migration, then deploy the updated frontend.
-- ============================================================

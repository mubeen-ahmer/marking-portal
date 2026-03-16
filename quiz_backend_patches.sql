-- ==============================================================================
-- 🔒 EDUMARK: Critical Security Patches (Run in Supabase SQL Editor)
-- ==============================================================================

-- 1. FIX "TIME FREEZE": Remove raw INSERT access from students on quiz_attempts
drop policy if exists "Student insert own attempts" on public.quiz_attempts;
-- (They can still start attempts securely via the start_quiz_attempt RPC)

-- 2. FIX "RACE CONDITION": Prevent multiple active attempts concurrently
create unique index if not exists idx_single_active_attempt 
on public.quiz_attempts (student_id, quiz_id) 
where is_submitted = false;

-- 3. FIX "PRE-FETCHING": Replace insecure view with secure RPC for questions
drop view if exists public.student_quiz_questions;

create or replace function public.get_student_quiz_questions(p_quiz_id uuid)
returns table (
  id uuid, quiz_id uuid, question_text text, option_a text, option_b text, option_c text, option_d text, sort_order int
)
language plpgsql
security definer
as $$
begin
  -- Ensure student has an active, unsubmitted attempt for this quiz
  if not exists (
    select 1 from public.quiz_attempts
    where student_id = auth.uid() and quiz_id = p_quiz_id and is_submitted = false
  ) then
    raise exception 'Unauthorized: You do not have an active attempt for this quiz.';
  end if;

  return query
  select q.id, q.quiz_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.sort_order
  from public.quiz_questions q
  where q.quiz_id = p_quiz_id
  order by q.sort_order;
end;
$$;

-- 4. FIX "INFINITE SCORE INJECTION": Ensure answers match current quiz questions
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
begin
  select * into v_attempt
  from public.quiz_attempts
  where id = p_attempt_id and student_id = auth.uid();

  if not found then raise exception 'Attempt not found'; end if;

  if v_attempt.is_submitted then
    return json_build_object('score', v_attempt.score, 'total', v_attempt.total);
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;
  select count(*) into v_total from public.quiz_questions where quiz_id = v_quiz.id;

  v_elapsed_mins := extract(epoch from (now() - v_attempt.started_at)) / 60.0;

  -- Score ONLY answers that belong to questions in this specific quiz (PREVENTS INJECTION)
  select count(*) into v_score
  from public.quiz_answers qa
  join public.quiz_questions qq on qq.id = qa.question_id
  where qa.attempt_id = p_attempt_id
    and qq.quiz_id = v_quiz.id  -- CRITICAL SECURITY FIX
    and qa.selected_option = qq.correct_option;

  update public.quiz_attempts
  set is_submitted = true, submitted_at = now(), score = v_score, total = v_total
  where id = p_attempt_id;

  return json_build_object('score', v_score, 'total', v_total);
end;
$$;

-- ==============================================================================
-- 🔒 EDUMARK: Advanced Anti-Cheat Patch (Run in Supabase SQL Editor)
-- ==============================================================================

-- 5. FIX "INFINITE TIME BYPASS": Stop DevTools users from pausing the network
-- Drop the old loose policies
drop policy if exists "Student insert own answers" on public.quiz_answers;
drop policy if exists "Student update own answers" on public.quiz_answers;

-- Create ultra-strict policies that check the server clock against the quiz time limit
create policy "Student insert own answers"
  on public.quiz_answers for insert
  with check (
    attempt_id in (
      select qa.id from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      where qa.student_id = auth.uid() 
        and qa.is_submitted = false
        -- The server clock MUST be within the allowed time limit (+ 2 min grace period for ping)
        and (extract(epoch from (now() - qa.started_at)) / 60.0) <= (q.time_limit_mins + 2.0)
    )
  );

create policy "Student update own answers"
  on public.quiz_answers for update
  using (
    attempt_id in (
      select qa.id from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      where qa.student_id = auth.uid() 
        and qa.is_submitted = false
        -- The server clock MUST be within the allowed time limit (+ 2 min grace period for ping)
        and (extract(epoch from (now() - qa.started_at)) / 60.0) <= (q.time_limit_mins + 2.0)
    )
  );

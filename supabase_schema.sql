-- ============================================================
-- EduMark — Complete Supabase Schema
-- Run this in your Supabase SQL Editor (new project)
-- ============================================================

-- 0. Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin','teacher','student')),
  email text,
  phone text,
  created_at timestamptz default now()
);

-- Courses
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

-- Subjects
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

-- Course ↔ Subject mapping
create table public.course_subjects (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unique(course_id, subject_id)
);

-- Batches
create table public.batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  course_id uuid not null references public.courses(id) on delete cascade,
  year int not null,
  created_at timestamptz default now()
);

-- Students (links profile to batch)
create table public.students (
  id uuid primary key references public.profiles(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  roll_no text unique not null,
  created_at timestamptz default now()
);

-- Student ↔ Subject enrollment
create table public.student_subjects (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unique(student_id, subject_id)
);

-- Teacher ↔ Subject (1 teacher = 1 subject, permanent)
create table public.teacher_subjects (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unique(teacher_id)
);

-- Teacher ↔ Batch assignments
create table public.teacher_batch_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  unique(teacher_id, batch_id)
);

-- Assessments
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  total_marks int not null check (total_marks > 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Marks
create table public.marks (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  obtained_marks numeric not null default 0,
  created_at timestamptz default now(),
  unique(assessment_id, student_id)
);

-- Quizzes
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  batch_id uuid not null references public.batches(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  time_limit_mins int not null default 30,
  max_attempts int not null default 1,
  expires_at timestamptz not null,
  pushed_to_assessments boolean default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Quiz Questions
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('a','b','c','d')),
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Quiz Attempts
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  is_submitted boolean default false,
  score int default 0,
  total int default 0,
  violations int default 0,
  created_at timestamptz default now()
);

-- Quiz Answers
create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  selected_option text not null check (selected_option in ('a','b','c','d')),
  created_at timestamptz default now()
);

-- Resource Categories
create table public.resource_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  icon text not null default 'folder',
  color text not null default '#4F46E5',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Resource Cards
create table public.resource_cards (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.resource_categories(id) on delete cascade,
  title text not null,
  description text not null default '',
  icon text not null default 'description',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Resource Items
create table public.resource_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.resource_cards(id) on delete cascade,
  label text not null,
  type text not null default 'link',
  url text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- 2. ENABLE RLS ON ALL TABLES
-- ============================================================

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.subjects enable row level security;
alter table public.course_subjects enable row level security;
alter table public.batches enable row level security;
alter table public.students enable row level security;
alter table public.student_subjects enable row level security;
alter table public.teacher_subjects enable row level security;
alter table public.teacher_batch_assignments enable row level security;
alter table public.assessments enable row level security;
alter table public.marks enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.resource_categories enable row level security;
alter table public.resource_cards enable row level security;
alter table public.resource_items enable row level security;

-- ============================================================
-- 3. HELPER FUNCTION: get current user's role
-- ============================================================

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ============================================================
-- 4. RLS POLICIES
-- ============================================================

-- === PROFILES ===
create policy "Admin full access to profiles"
  on public.profiles for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "Users read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Teachers read student profiles"
  on public.profiles for select
  using (
    public.get_my_role() = 'teacher' and role = 'student'
  );

create policy "Users update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- === COURSES ===
create policy "Authenticated users read courses"
  on public.courses for select
  using (auth.uid() is not null);

create policy "Admin manage courses"
  on public.courses for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- === SUBJECTS ===
create policy "Authenticated users read subjects"
  on public.subjects for select
  using (auth.uid() is not null);

create policy "Admin manage subjects"
  on public.subjects for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- === COURSE_SUBJECTS ===
create policy "Authenticated users read course_subjects"
  on public.course_subjects for select
  using (auth.uid() is not null);

create policy "Admin manage course_subjects"
  on public.course_subjects for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- === BATCHES ===
create policy "Authenticated users read batches"
  on public.batches for select
  using (auth.uid() is not null);

create policy "Admin manage batches"
  on public.batches for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- === STUDENTS ===
create policy "Admin full access to students"
  on public.students for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "Teacher read students in assigned batches"
  on public.students for select
  using (
    public.get_my_role() = 'teacher'
    and batch_id in (
      select batch_id from public.teacher_batch_assignments where teacher_id = auth.uid()
    )
  );

create policy "Student read own record"
  on public.students for select
  using (id = auth.uid());

-- === STUDENT_SUBJECTS ===
create policy "Admin full access to student_subjects"
  on public.student_subjects for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "Teacher read student_subjects"
  on public.student_subjects for select
  using (public.get_my_role() = 'teacher');

create policy "Student read own subjects"
  on public.student_subjects for select
  using (student_id = auth.uid());

-- === TEACHER_SUBJECTS ===
create policy "Admin full access to teacher_subjects"
  on public.teacher_subjects for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "Teacher read own subject"
  on public.teacher_subjects for select
  using (teacher_id = auth.uid());

-- === TEACHER_BATCH_ASSIGNMENTS ===
create policy "Admin full access to teacher_batch_assignments"
  on public.teacher_batch_assignments for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "Teacher read own assignments"
  on public.teacher_batch_assignments for select
  using (teacher_id = auth.uid());

-- === ASSESSMENTS ===
create policy "Admin full access to assessments"
  on public.assessments for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "Teacher manage assessments for assigned batches"
  on public.assessments for all
  using (
    public.get_my_role() = 'teacher'
    and batch_id in (
      select batch_id from public.teacher_batch_assignments where teacher_id = auth.uid()
    )
  )
  with check (
    public.get_my_role() = 'teacher'
    and batch_id in (
      select batch_id from public.teacher_batch_assignments where teacher_id = auth.uid()
    )
  );

create policy "Student read assessments for own batch"
  on public.assessments for select
  using (
    public.get_my_role() = 'student'
    and batch_id = (select batch_id from public.students where id = auth.uid())
  );

-- === MARKS ===
create policy "Admin full access to marks"
  on public.marks for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "Teacher manage marks for assigned batches"
  on public.marks for all
  using (
    public.get_my_role() = 'teacher'
    and assessment_id in (
      select a.id from public.assessments a
      join public.teacher_batch_assignments tba on tba.batch_id = a.batch_id
      where tba.teacher_id = auth.uid()
    )
  )
  with check (
    public.get_my_role() = 'teacher'
    and assessment_id in (
      select a.id from public.assessments a
      join public.teacher_batch_assignments tba on tba.batch_id = a.batch_id
      where tba.teacher_id = auth.uid()
    )
  );

create policy "Student read own marks"
  on public.marks for select
  using (student_id = auth.uid());

-- === QUIZZES ===
create policy "Admin full access to quizzes"
  on public.quizzes for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "Teacher manage own quizzes"
  on public.quizzes for all
  using (public.get_my_role() = 'teacher' and created_by = auth.uid())
  with check (public.get_my_role() = 'teacher' and created_by = auth.uid());

create policy "Student read quizzes for own batch"
  on public.quizzes for select
  using (
    public.get_my_role() = 'student'
    and batch_id = (select batch_id from public.students where id = auth.uid())
  );

-- === QUIZ_QUESTIONS ===
-- Students access questions ONLY through the secure view (no correct_option)
create policy "Admin full access to quiz_questions"
  on public.quiz_questions for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "Teacher manage quiz questions"
  on public.quiz_questions for all
  using (
    public.get_my_role() = 'teacher'
    and quiz_id in (select id from public.quizzes where created_by = auth.uid())
  )
  with check (
    public.get_my_role() = 'teacher'
    and quiz_id in (select id from public.quizzes where created_by = auth.uid())
  );

-- NO student policy on quiz_questions — they use the secure view below

-- Secure view that hides correct_option from students
create or replace view public.student_quiz_questions as
  select id, quiz_id, question_text, option_a, option_b, option_c, option_d, sort_order, created_at
  from public.quiz_questions;

grant select on public.student_quiz_questions to authenticated;

-- === QUIZ_ATTEMPTS ===
create policy "Admin read quiz_attempts"
  on public.quiz_attempts for select
  using (public.get_my_role() = 'admin');

create policy "Teacher read quiz_attempts for own quizzes"
  on public.quiz_attempts for select
  using (
    public.get_my_role() = 'teacher'
    and quiz_id in (select id from public.quizzes where created_by = auth.uid())
  );

-- SECURE: Granular student policies (NO update, NO delete)
create policy "Student read own attempts"
  on public.quiz_attempts for select
  using (student_id = auth.uid());

create policy "Student insert own attempts"
  on public.quiz_attempts for insert
  with check (student_id = auth.uid());

-- Students CANNOT update or delete attempts (handled via RPCs)

-- === QUIZ_ANSWERS ===
create policy "Admin read quiz_answers"
  on public.quiz_answers for select
  using (public.get_my_role() = 'admin');

create policy "Teacher read quiz_answers for own quizzes"
  on public.quiz_answers for select
  using (
    public.get_my_role() = 'teacher'
    and attempt_id in (
      select qa.id from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      where q.created_by = auth.uid()
    )
  );

create policy "Student insert own answers"
  on public.quiz_answers for insert
  with check (
    attempt_id in (
      select id from public.quiz_attempts
      where student_id = auth.uid() and is_submitted = false
    )
  );

create policy "Student update own answers"
  on public.quiz_answers for update
  using (
    attempt_id in (
      select id from public.quiz_attempts
      where student_id = auth.uid() and is_submitted = false
    )
  );

create policy "Student read own answers"
  on public.quiz_answers for select
  using (
    attempt_id in (select id from public.quiz_attempts where student_id = auth.uid())
  );

-- Prevent duplicate answers per question per attempt
alter table public.quiz_answers
  add constraint quiz_answers_attempt_question_unique
  unique (attempt_id, question_id);

-- === RESOURCES (authenticated users can read) ===
create policy "Authenticated read resource_categories"
  on public.resource_categories for select
  using (auth.uid() is not null);

create policy "Admin manage resource_categories"
  on public.resource_categories for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "Authenticated read resource_cards"
  on public.resource_cards for select
  using (auth.uid() is not null);

create policy "Admin manage resource_cards"
  on public.resource_cards for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "Authenticated read resource_items"
  on public.resource_items for select
  using (auth.uid() is not null);

create policy "Admin manage resource_items"
  on public.resource_items for all
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- ============================================================
-- 5. FUNCTIONS
-- ============================================================

-- Generate roll number: PREFIX + YY + '-' + NNN
create or replace function public.generate_roll(p_batch_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_batch record;
  v_course_name text;
  v_prefix text;
  v_year_suffix text;
  v_count int;
  v_roll text;
begin
  select b.*, c.name as course_name
  into v_batch
  from public.batches b
  join public.courses c on c.id = b.course_id
  where b.id = p_batch_id;

  if not found then
    raise exception 'Batch not found';
  end if;

  v_prefix := upper(left(v_batch.course_name, 2));
  v_year_suffix := right(v_batch.year::text, 2);

  select count(*) into v_count
  from public.students
  where batch_id = p_batch_id;

  v_roll := v_prefix || v_year_suffix || '-' || lpad((v_count + 1)::text, 3, '0');
  return v_roll;
end;
$$;

-- Enroll student (create students row)
create or replace function public.enroll_student(p_profile_id uuid, p_batch_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_roll text;
begin
  v_roll := public.generate_roll(p_batch_id);
  insert into public.students (id, batch_id, roll_no)
  values (p_profile_id, p_batch_id, v_roll);
end;
$$;

-- Delete user from auth (admin only)
create or replace function public.delete_user_from_auth(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- RLS on profiles already checks admin role
  -- Delete from auth.users cascades to profiles → students, etc.
  delete from auth.users where id = p_user_id;
end;
$$;

-- Confirm user email (used after GoTrue signUp from frontend)
-- User creation now uses supabase.auth.signUp() via an isolated client,
-- which properly hashes passwords through GoTrue. This function just
-- confirms the email so the user can log in immediately.
create or replace function public.confirm_user_email(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if public.get_my_role() != 'admin' then
    raise exception 'Admin access required';
  end if;
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = p_user_id;
end;
$$;

-- Start a quiz attempt (server-side enforcement of expiry + max attempts)
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
      -- Auto-submit with whatever answers exist
      select count(*) into v_total from public.quiz_questions where quiz_id = v_quiz.id;
      select count(*) into v_score
      from public.quiz_answers qa
      join public.quiz_questions qq on qq.id = qa.question_id
      where qa.attempt_id = v_existing.id
        and qa.selected_option = qq.correct_option;

      update public.quiz_attempts
      set is_submitted = true, submitted_at = now(), score = v_score, total = v_total
      where id = v_existing.id;

      return json_build_object(
        'id', v_existing.id, 'quiz_id', v_existing.quiz_id,
        'student_id', v_existing.student_id, 'started_at', v_existing.started_at,
        'is_submitted', true, 'violations', v_existing.violations,
        'score', v_score, 'total', v_total,
        'resumed', false, 'auto_submitted', true
      );
    end if;

    -- Time not expired — resume
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

-- Record a violation in real-time
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

-- Calculate quiz score (server-side, with time enforcement)
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
  select count(*) into v_total from public.quiz_questions where quiz_id = v_quiz.id;

  -- SERVER-SIDE TIME ENFORCEMENT
  v_elapsed_mins := extract(epoch from (now() - v_attempt.started_at)) / 60.0;

  -- Score existing answers (even if late — fair for auto-submit edge cases)
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

-- Server time helper (anti-clock-manipulation)
create or replace function public.get_server_time()
returns timestamptz
language sql
stable
security definer
as $$
  select now();
$$;

-- ============================================================
-- 6. SEED DATA: Courses & Subjects
-- ============================================================

insert into public.courses (name) values ('NUST'), ('FAST'), ('MDCAT'), ('ECAT');

insert into public.subjects (name) values
  ('Physics'), ('Math'), ('Basic Math'), ('Chemistry'),
  ('Biology'), ('English'), ('IQ/Analytical Skills'), ('Logical Reasoning');

-- Course ↔ Subject mappings
insert into public.course_subjects (course_id, subject_id)
select c.id, s.id from public.courses c, public.subjects s
where (c.name = 'NUST' and s.name in ('Physics','Math','Basic Math','Chemistry','English'))
   or (c.name = 'FAST' and s.name in ('Math','Basic Math','IQ/Analytical Skills','English'))
   or (c.name = 'MDCAT' and s.name in ('Biology','Chemistry','Physics','English','Logical Reasoning'))
   or (c.name = 'ECAT' and s.name in ('Physics','Math','Chemistry','English'));

-- ============================================================
-- 7. CREATE INITIAL ADMIN USER
-- Replace 'your-admin-email@example.com' and 'YourSecurePassword'
-- with your actual admin credentials.
-- After running this, use these credentials to log in.
-- ============================================================

-- NOTE: Create your admin user via Supabase Dashboard > Authentication > Users > "Add User"
-- Then run this to set the role:
-- insert into public.profiles (id, full_name, role, email)
-- values ('<paste-user-id-here>', 'Admin Name', 'admin', 'admin@example.com');

-- ============================================================
-- DONE! Your schema is ready.
-- ============================================================

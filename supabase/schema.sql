-- Reading App database schema for Supabase.
-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- It is safe to re-run: every statement checks whether the object already exists.

-- "Today" for streaks is the calendar day in India Standard Time.
create or replace function public.today_ist()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- One row per team member. The id is the anonymous Supabase user created on the join screen.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 60),
  avatar_path text,
  created_at  timestamptz not null default now()
);

-- Books each member has picked up. Exactly one book per member has status 'reading'.
create table if not exists public.books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(trim(title)) between 1 and 200),
  author      text check (author is null or char_length(author) <= 120),
  progress    text check (progress in ('just_started', 'midway', 'almost_done')),
  status      text not null default 'reading' check (status in ('reading', 'finished')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists books_one_current_per_user
  on public.books (user_id) where status = 'reading';

-- A learning (the daily post). posted_on drives streaks and is always set by the server.
create table if not exists public.learnings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  book_id    uuid not null references public.books (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 500),
  chapter    text check (chapter is null or char_length(chapter) <= 120),
  photo_path text,
  posted_on  date not null default public.today_ist(),
  created_at timestamptz not null default now()
);
create index if not exists learnings_created_at_idx on public.learnings (created_at desc);
create index if not exists learnings_user_day_idx on public.learnings (user_id, posted_on);

-- "Insightful" reactions: one per member per learning.
create table if not exists public.reactions (
  learning_id uuid not null references public.learnings (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (learning_id, user_id)
);

-- Streaks. A streak is a run of consecutive IST days with at least one learning.
-- It stays alive until the end of today, so a run that ended yesterday still counts.
create or replace view public.member_stats
with (security_invoker = true)
as
with days as (
  select distinct user_id, posted_on from public.learnings
),
runs as (
  select user_id,
         max(posted_on) as last_day,
         count(*)::int  as length
  from (
    select user_id, posted_on,
           posted_on - (row_number() over (partition by user_id order by posted_on))::int as run_key
    from days
  ) d
  group by user_id, run_key
)
select p.id as user_id,
       coalesce((select r.length from runs r
                 where r.user_id = p.id and r.last_day >= public.today_ist() - 1
                 order by r.last_day desc limit 1), 0) as current_streak,
       coalesce((select max(r.length) from runs r where r.user_id = p.id), 0) as longest_streak,
       exists (select 1 from days d
               where d.user_id = p.id and d.posted_on = public.today_ist()) as posted_today
from public.profiles p;

-- Row level security. Every signed-in member (including anonymous sign-ins) can read
-- everything, and can only create, change or delete their own rows.
alter table public.profiles  enable row level security;
alter table public.books     enable row level security;
alter table public.learnings enable row level security;
alter table public.reactions enable row level security;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using (true);
drop policy if exists "create own profile" on public.profiles;
create policy "create own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "members read books" on public.books;
create policy "members read books" on public.books
  for select to authenticated using (true);
drop policy if exists "add own books" on public.books;
create policy "add own books" on public.books
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update own books" on public.books;
create policy "update own books" on public.books
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "members read learnings" on public.learnings;
create policy "members read learnings" on public.learnings
  for select to authenticated using (true);
drop policy if exists "post own learnings" on public.learnings;
create policy "post own learnings" on public.learnings
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and posted_on = public.today_ist()
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
  );
drop policy if exists "delete own learnings" on public.learnings;
create policy "delete own learnings" on public.learnings
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "members read reactions" on public.reactions;
create policy "members read reactions" on public.reactions
  for select to authenticated using (true);
drop policy if exists "add own reactions" on public.reactions;
create policy "add own reactions" on public.reactions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "remove own reactions" on public.reactions;
create policy "remove own reactions" on public.reactions
  for delete to authenticated using (user_id = auth.uid());

-- Photo storage: public buckets so images load quickly in the feed. Each member can
-- only upload into a folder named after their own user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
       ('photos',  'photos',  true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "upload own images" on storage.objects;
create policy "upload own images" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('avatars', 'photos')
              and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete own images" on storage.objects;
create policy "delete own images" on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars', 'photos')
         and (storage.foldername(name))[1] = auth.uid()::text);

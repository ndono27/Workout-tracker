-- Run once in Supabase: Dashboard → SQL → New query → Run

create table if not exists public.workout_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workout_snapshots enable row level security;

create policy "workout_snapshots_select_own"
  on public.workout_snapshots for select
  to authenticated
  using (auth.uid() = user_id);

create policy "workout_snapshots_insert_own"
  on public.workout_snapshots for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "workout_snapshots_update_own"
  on public.workout_snapshots for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

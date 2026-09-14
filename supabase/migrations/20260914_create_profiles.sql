-- ============================================================
-- Phase 1: RBAC Foundation — profiles table & auto-create trigger
-- ============================================================

-- 1. Custom ENUM for roles
create type public.user_role as enum ('ADMIN', 'KEUANGAN', 'USER');

-- 2. Profiles table (linked 1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'USER',
  created_at timestamptz not null default now()
);

-- 3. RLS
alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Service role (backend) can read all profiles (via supabase admin client)
-- No explicit policy needed — service role key bypasses RLS.

-- 4. Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'USER'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

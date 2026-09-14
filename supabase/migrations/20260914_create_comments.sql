-- ============================================================
-- Phase 4: Add comments table
-- ============================================================

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  comment text not null,
  created_at timestamptz default now()
);

alter table public.comments enable row level security;

create policy "admin_keuangan_read_comments"
  on public.comments for select
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('ADMIN','KEUANGAN')
  ));

create policy "keuangan_write_comments"
  on public.comments for insert
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'KEUANGAN'
  ));

-- ============================================================
-- Phase 2: Document Management — documents table & status tracking
-- ============================================================

-- 1. Custom ENUM for document status
create type public.document_status as enum (
  'UNPROCESSED',
  'PROCESSING',
  'DRAFT_READY',
  'IN_REVIEW',
  'REVISION_REQUESTED',
  'POSTED'
);

-- 2. Documents table
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  file_id text not null,
  nama text not null,
  status public.document_status not null default 'UNPROCESSED',
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Auto-update updated_at on every row change
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger documents_updated_at
  before update on public.documents
  for each row execute function public.update_updated_at_column();

-- 4. RLS
alter table public.documents enable row level security;

-- ADMIN & KEUANGAN can read all documents
create policy "admin_keuangan_read_documents"
  on public.documents for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('ADMIN', 'KEUANGAN')
    )
  );

-- Only ADMIN can insert/update/delete (defense-in-depth;
-- backend uses service key so this is a safety net for direct client access)
create policy "admin_write_documents"
  on public.documents for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'ADMIN'
    )
  );

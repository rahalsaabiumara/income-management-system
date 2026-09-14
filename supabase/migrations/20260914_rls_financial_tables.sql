-- ============================================================
-- Phase 5: RLS Policies for Financial Tables
-- ============================================================

-- Enable RLS
alter table public.laba_rugi enable row level security;
alter table public.arus_kas enable row level security;
alter table public.neraca enable row level security;
alter table public.pendapatan enable row level security;

-- Policy for laba_rugi
create policy "read_posted_only" on public.laba_rugi for select
  using (exists (
    select 1 from public.documents
    where documents.id = laba_rugi.document_id
    and documents.status = 'POSTED'
  ));

-- Policy for arus_kas
create policy "read_posted_only" on public.arus_kas for select
  using (exists (
    select 1 from public.documents
    where documents.id = arus_kas.document_id
    and documents.status = 'POSTED'
  ));

-- Policy for neraca
create policy "read_posted_only" on public.neraca for select
  using (exists (
    select 1 from public.documents
    where documents.id = neraca.document_id
    and documents.status = 'POSTED'
  ));

-- Policy for pendapatan
create policy "read_posted_only" on public.pendapatan for select
  using (exists (
    select 1 from public.documents
    where documents.id = pendapatan.document_id
    and documents.status = 'POSTED'
  ));

-- ============================================================
-- Phase 3: Add document_id reference to financial tables
-- ============================================================

alter table public.laba_rugi add column if not exists document_id uuid references public.documents(id) on delete cascade;
alter table public.arus_kas add column if not exists document_id uuid references public.documents(id) on delete cascade;
alter table public.neraca add column if not exists document_id uuid references public.documents(id) on delete cascade;
alter table public.pendapatan add column if not exists document_id uuid references public.documents(id) on delete cascade;

-- ============================================================
-- Phase 5: ReviewHub Enhancements (Status, Comments Schema)
-- ============================================================

-- 1. Add APPROVED to document_status
ALTER TYPE public.document_status ADD VALUE IF NOT EXISTS 'APPROVED' BEFORE 'POSTED';

-- 2. Extend comments table
DO $$
BEGIN
    -- We'll use simple text for jenis_komentar to avoid enum lock-in for now, or ENUM if preferred. 
    -- We will use text to match the frontend easily.
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='jenis_komentar') THEN
        ALTER TABLE public.comments ADD COLUMN jenis_komentar text DEFAULT 'CATATAN';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='sheet_name') THEN
        ALTER TABLE public.comments ADD COLUMN sheet_name text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='target_cell') THEN
        ALTER TABLE public.comments ADD COLUMN target_cell text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='target_identifier') THEN
        ALTER TABLE public.comments ADD COLUMN target_identifier text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='status') THEN
        ALTER TABLE public.comments ADD COLUMN status text DEFAULT 'OPEN';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='resolved_at') THEN
        ALTER TABLE public.comments ADD COLUMN resolved_at timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='resolved_by') THEN
        ALTER TABLE public.comments ADD COLUMN resolved_by uuid references public.profiles(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='author_role') THEN
        ALTER TABLE public.comments ADD COLUMN author_role text;
    END IF;
END $$;

-- 3. Update RLS policies for comments (Keuangan can update to resolve)
-- Admin should be able to read, Keuangan can write and update own/relevant comments.
-- We will drop the existing 'keuangan_write_comments' and recreate it to include UPDATE.
DROP POLICY IF EXISTS "keuangan_write_comments" ON public.comments;
DROP POLICY IF EXISTS "keuangan_update_comments" ON public.comments;

CREATE POLICY "keuangan_write_comments"
  ON public.comments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'KEUANGAN'
    )
  );

CREATE POLICY "keuangan_update_comments"
  ON public.comments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'KEUANGAN'
    )
  );

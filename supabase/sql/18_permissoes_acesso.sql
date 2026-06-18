-- ============================================================
-- 18_permissoes_acesso.sql
-- Overrides de acesso por (cargo, área), editadas pelo admin em /permissoes.
-- Só guarda o que foi ligado/desligado; o restante segue os padrões do
-- código (src/lib/auth/permissoes.ts).
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.permissoes_acesso (
  role text NOT NULL,
  area text NOT NULL,
  liberado boolean NOT NULL,
  atualizado_por uuid REFERENCES public.users (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, area)
);

ALTER TABLE public.permissoes_acesso ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'permissoes_acesso'
      AND policyname = 'permissoes_acesso_authenticated'
  ) THEN
    CREATE POLICY permissoes_acesso_authenticated
      ON public.permissoes_acesso
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 34_empresas.sql
-- Cadastro das EMPRESAS (CNPJs) do grupo e o vínculo com as contas de
-- marketplace.
--
-- São ~3 CNPJs, e cada empresa tem uma conta em cada marketplace. A
-- empresa marcada como PRINCIPAL é a que identifica os documentos
-- impressos (pedido, via de separação e romaneio) — hoje esse dado está
-- escrito fixo em 4 pontos do código.
--
-- `contas_marketplace.empresa_id` é NULLABLE de propósito: as contas que
-- já existem não têm empresa e não haverá backfill. A obrigatoriedade
-- vive no FORMULÁRIO, não no schema — mesmo critério do `conta_id` de
-- remessas_full (33_contas_marketplace.sql).
--
-- Idempotente. Só aditivo (CREATE TABLE / CREATE INDEX / ADD COLUMN).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  nome_fantasia text,
  -- Guardado NORMALIZADO (só dígitos/maiúsculas, sem pontuação), igual ao
  -- documento do comprador; a pontuação entra só na exibição. Nullable
  -- porque o cadastro pode nascer antes de alguém ter o CNPJ à mão — o
  -- dígito verificador é validado no zod quando o campo vem preenchido.
  cnpj text,
  -- A empresa que sai nos documentos. No máximo UMA (índice abaixo).
  principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Um CNPJ não se repete entre as empresas vivas. Parcial: várias linhas
-- podem ter cnpj NULL, e as excluídas saem do índice.
CREATE UNIQUE INDEX IF NOT EXISTS empresas_cnpj_uidx
  ON public.empresas (cnpj)
  WHERE cnpj IS NOT NULL AND deleted_at IS NULL;

-- No máximo UMA principal. O índice é único sobre a própria coluna
-- `principal` e só enxerga as linhas onde ela é true — duas principais
-- colidem na mesma chave. A action também desmarca a anterior dentro da
-- transação, mas quem garante contra dois cliques ao mesmo tempo é aqui.
CREATE UNIQUE INDEX IF NOT EXISTS empresas_principal_uidx
  ON public.empresas (principal)
  WHERE principal AND deleted_at IS NULL;

-- SET NULL: apagar uma empresa nunca pode apagar conta de marketplace.
-- A conta perde a identificação e volta a exibir "sem empresa".
ALTER TABLE public.contas_marketplace
  ADD COLUMN IF NOT EXISTS empresa_id uuid
  REFERENCES public.empresas (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contas_marketplace_empresa_idx
  ON public.contas_marketplace (empresa_id);

-- RLS (mesmo padrão de 29_movimentacoes_fio.sql).
--
-- A lista de cargos que escrevem é propositalmente mais larga que o
-- nivelPadrao da área: ela é o piso grosso, e quem faz o controle fino é
-- /permissoes + requireAreaEscrita. Se um dia o admin liberar a área pro
-- gerente, a política não pode ser o que impede.
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empresas_select ON public.empresas;
CREATE POLICY empresas_select ON public.empresas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS empresas_write ON public.empresas;
CREATE POLICY empresas_write ON public.empresas
  FOR ALL TO authenticated
  USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]))
  WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));

-- ============================================================
-- 31_compradores.sql
-- Cadastro de compradores (clientes). Só `nome` é obrigatório — o cliente
-- às vezes só manda o nome no WhatsApp, então o cadastro tem que aceitar
-- isso e ser completado depois.
--
-- `documento` guarda CPF ou CNPJ NORMALIZADO (sem pontuação, em maiúsculas
-- — o CNPJ alfanumérico pode ter letras nas 12 primeiras posições); a
-- formatação acontece na exibição. Validação de dígito verificador fica no
-- validator (zod), não no banco.
--
-- Vínculo com orçamentos: `orcamentos.comprador_id` é NULLABLE e a coluna
-- de texto `orcamentos.cliente` continua sendo a fonte do nome impresso —
-- orçamento antigo não tem comprador_id e continua abrindo igual. Sem
-- backfill: nenhum comprador é criado a partir dos nomes já digitados.
--
-- Idempotente. Só aditivo (CREATE TABLE / CREATE INDEX / ADD COLUMN).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.compradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  -- CPF (11 dígitos) ou CNPJ (14 posições), normalizado. Nulo enquanto não
  -- informado — o cadastro nasce podendo ter só o nome.
  documento text,
  telefone text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS compradores_nome_idx ON public.compradores (nome);

-- Documento único entre os não-excluídos e só quando informado (índice
-- único PARCIAL) — evita cadastrar o mesmo CPF/CNPJ duas vezes, sem
-- impedir vários compradores ainda sem documento.
CREATE UNIQUE INDEX IF NOT EXISTS compradores_documento_uidx
  ON public.compradores (documento)
  WHERE documento IS NOT NULL AND deleted_at IS NULL;

-- Vínculo OPCIONAL do orçamento com o comprador cadastrado.
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS comprador_id uuid
  REFERENCES public.compradores (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orcamentos_comprador_idx
  ON public.orcamentos (comprador_id);

-- RLS — mesmo padrão de 28/29, com UMA diferença deliberada: aqui o SELECT
-- também é restrito por cargo. As outras tabelas usam `USING (true)` porque
-- são dado operacional; esta guarda dado pessoal (documento, endereço,
-- telefone) e não deve ficar legível pro chão de fábrica nem via API REST
-- do Supabase.
ALTER TABLE public.compradores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compradores_select ON public.compradores;
CREATE POLICY compradores_select ON public.compradores
  FOR SELECT TO authenticated
  USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));

DROP POLICY IF EXISTS compradores_write ON public.compradores;
CREATE POLICY compradores_write ON public.compradores
  FOR ALL TO authenticated
  USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]))
  WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));

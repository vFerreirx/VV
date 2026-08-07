-- ============================================================
-- 38_precos.sql
-- Preço de tabela do catálogo, pra preencher sozinho o preço unitário
-- quando o vendedor puxa um produto ou kit no pedido.
--
-- POR QUE O PREÇO MORA NO PAR (PRODUTO, TAMANHO):
-- porque é assim que o catálogo do cliente precifica. A Peseira ACONCHEGO
-- custa 50 no Casal, 60 no Queen e 70 no King. Um campo único em `produtos`
-- não conseguiria dizer isso, e um preço por tamanho (como
-- `tamanhos.peso_gramas` faz com o peso) valeria pra todos os modelos ao
-- mesmo tempo — e não vale: no 45x45 a capa ACONCHEGO é 25 e a LINKS é 20.
-- Só o par resolve. Mesma coisa pro kit.
--
-- ESTE PREÇO NÃO É O PREÇO DO PEDIDO. `orcamento_itens.preco_unitario`
-- continua sendo SNAPSHOT do que foi negociado (ver o comentário no topo de
-- src/lib/db/schema/orcamentos.ts): mexer aqui NÃO altera pedido já salvo.
-- É o oposto do peso, que é recalculado na leitura de propósito (ver o topo
-- de src/lib/peso.ts) — peso serve pra cotar frete, preço registra quanto se
-- cobrou.
--
-- numeric(12,2), igual a `orcamento_itens.preco_unitario`: o valor daqui vai
-- direto pra lá e os dois têm que casar sem arredondar no caminho.
--
-- Sem `deleted_at`: preço de tabela não é entidade de cadastro, é um valor
-- do par. Tirar o preço é apagar a linha, e o produto/kit sumindo leva os
-- preços dele junto (ON DELETE CASCADE). Já o `tamanho_id` fica sem ação de
-- cascata de propósito: apagar um tamanho que tem preço cadastrado deve
-- falhar e doer, em vez de esvaziar a tabela de preço em silêncio.
--
-- Idempotente. Só aditivo (CREATE TABLE / CREATE INDEX / CREATE POLICY).
-- Nenhuma linha existente é tocada.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.produto_tamanho_preco (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos (id) ON DELETE CASCADE,
  tamanho_id uuid NOT NULL REFERENCES public.tamanhos (id),
  preco numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produto_tamanho_preco_uk UNIQUE (produto_id, tamanho_id)
);

CREATE TABLE IF NOT EXISTS public.kit_tamanho_preco (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES public.kits (id) ON DELETE CASCADE,
  tamanho_id uuid NOT NULL REFERENCES public.tamanhos (id),
  preco numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kit_tamanho_preco_uk UNIQUE (kit_id, tamanho_id)
);

-- Preço nunca é negativo. Zero é permitido (brinde/cortesia com linha no
-- pedido); quem não tem preço não tem linha.
ALTER TABLE public.produto_tamanho_preco
  DROP CONSTRAINT IF EXISTS produto_tamanho_preco_nao_negativo_ck;
ALTER TABLE public.produto_tamanho_preco
  ADD CONSTRAINT produto_tamanho_preco_nao_negativo_ck CHECK (preco >= 0);

ALTER TABLE public.kit_tamanho_preco
  DROP CONSTRAINT IF EXISTS kit_tamanho_preco_nao_negativo_ck;
ALTER TABLE public.kit_tamanho_preco
  ADD CONSTRAINT kit_tamanho_preco_nao_negativo_ck CHECK (preco >= 0);

-- O builder carrega o catálogo inteiro de uma vez (são 21 produtos e 10
-- kits), mas a tela de cadastro busca os preços de UM produto/kit. O UNIQUE
-- já cobre (produto_id, tamanho_id); estes cobrem a busca só por dono.
CREATE INDEX IF NOT EXISTS produto_tamanho_preco_produto_idx
  ON public.produto_tamanho_preco (produto_id);
CREATE INDEX IF NOT EXISTS kit_tamanho_preco_kit_idx
  ON public.kit_tamanho_preco (kit_id);

-- --------------------------------------------------------------
-- RLS — espelha `produtos` e `tamanhos` (04_rls.sql), que é o que estas
-- tabelas são: catálogo. Leitura pra qualquer autenticado (vendas precisa
-- ler o preço no builder do pedido) e escrita pra gerência, que é quem
-- entra em /produtos e /kits.
--
-- Como nas outras, o app NÃO depende disto: todo acesso é server-side e
-- passa por requireArea/requireAreaEscrita. Estas policies só limitam
-- acesso direto à API REST do Supabase.
-- --------------------------------------------------------------
ALTER TABLE public.produto_tamanho_preco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_tamanho_preco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS produto_tamanho_preco_select_authenticated ON public.produto_tamanho_preco;
CREATE POLICY produto_tamanho_preco_select_authenticated ON public.produto_tamanho_preco
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS produto_tamanho_preco_manager_all ON public.produto_tamanho_preco;
CREATE POLICY produto_tamanho_preco_manager_all ON public.produto_tamanho_preco
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS kit_tamanho_preco_select_authenticated ON public.kit_tamanho_preco;
CREATE POLICY kit_tamanho_preco_select_authenticated ON public.kit_tamanho_preco
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS kit_tamanho_preco_manager_all ON public.kit_tamanho_preco;
CREATE POLICY kit_tamanho_preco_manager_all ON public.kit_tamanho_preco
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

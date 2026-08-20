-- ============================================================
-- 47_preco_marketplace.sql
--
-- ⚠️ REGRA DE OURO, e ela vale acima de qualquer conveniência deste arquivo:
--
--     PREÇO DE MARKETPLACE NÃO É PREÇO DE ATACADO.
--     O PEDIDO SEMPRE PUXA O DE ATACADO.
--
-- As tabelas criadas aqui (`*_preco_marketplace`) são IRMÃS das de atacado
-- (`produto_tamanho_preco` e `kit_tamanho_preco`, migration 38): mesmas
-- colunas, mesmos tipos, mesmos nomes quase iguais. É exatamente por serem
-- parecidas que alguém vai ligar a errada no builder do pedido um dia. Não
-- ligue. O pedido lê `obterCatalogoDePrecos` (atacado) e ponto; nada em
-- src/app/(app)/pedidos/ pode importar de src/lib/preco-marketplace.ts.
-- O preço de marketplace existe pra CONFERIR anúncio, não pra vender.
--
-- Este arquivo faz DUAS coisas:
--   (1) troca a chave de `kit_tamanho_preco` — a de ATACADO — pela
--       combinação de tamanhos; e
--   (2) cria as duas tabelas de marketplace, com a MESMA regra de chave.
--
-- As duas juntas de propósito: chave diferente entre atacado e marketplace
-- é o defeito que o AGENTS.md descreve — preço cadastrado que vira
-- inalcançável sem ninguém perceber.
--
-- ------------------------------------------------------------
-- (1) POR QUE A CHAVE DO KIT MUDA
--
-- `kit_tamanho_preco` guardava UM `tamanho_id`, e o AGENTS.md registrava que
-- ela "só faz sentido com um tamanho único". A planilha de marketplace prova
-- que não basta: o Kit Peseira+2 Capas ACONCHEGO custa 149,99 com capa 45,
-- 159,99 com capa 50 e 169,99 com capa 60 — no MESMO tamanho de peseira. Com
-- um tamanho só, esses três preços disputariam a mesma linha.
--
-- A chave passa a ser `combinacao`: os tamanhos de TODOS os componentes
-- variáveis, num texto canônico `<produtoId>=<tamanho>|...` ordenado por
-- produtoId. Quem monta é `chaveDeTamanhos` em src/lib/kit-tamanhos.ts — a
-- fonte única da regra, compartilhada pelo builder do pedido, pelo cadastro
-- e pelo cálculo. Leia o comentário de lá antes de mexer aqui.
--
-- `''` (vazio) é chave VÁLIDA: kit sem componente variável tem um preço só
-- (Kit Manta + 2 Capas SIENA — capa só em 45x45, manta só em Manta).
--
-- O QUE SE PERDE: o FK `tamanho_id`. Apagar um tamanho não estoura mais pro
-- preço de kit (continua estourando pro de produto). Em troca, a chave guarda
-- o NOME do tamanho, então tamanho renomeado/apagado torna a linha
-- INALCANÇÁVEL — e inalcançável aparece na tela como "sem preço", em vez de
-- virar preço errado em silêncio.
--
-- RECRIAR EM VEZ DE ALTERAR: `kit_tamanho_preco` está com ZERO linhas, então
-- não há dado a migrar. O bloco abaixo detecta a forma ANTIGA pela coluna
-- `tamanho_id`, ABORTA se houver qualquer linha (alguém cadastrou preço entre
-- escrever isto e rodar), e só então recria. Rodar de novo depois é no-op: a
-- coluna `tamanho_id` não existe mais e o bloco nem entra.
--
-- Idempotente. Nenhum dado é destruído em silêncio.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'kit_tamanho_preco'
      AND column_name = 'tamanho_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.kit_tamanho_preco) THEN
      RAISE EXCEPTION
        'kit_tamanho_preco tem linhas na forma antiga (tamanho_id). '
        'Converta para `combinacao` à mão antes de rodar esta migration — '
        'recriar aqui apagaria preço cadastrado.';
    END IF;
    DROP TABLE public.kit_tamanho_preco;
  END IF;
END $$;

-- Preço FECHADO do kit, de ATACADO, por combinação de tamanhos.
CREATE TABLE IF NOT EXISTS public.kit_tamanho_preco (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES public.kits (id) ON DELETE CASCADE,
  -- `<produtoId>=<tamanho>|...` ordenado por produtoId. Ver
  -- `chaveDeTamanhos` em src/lib/kit-tamanhos.ts — NÃO monte esta string à
  -- mão em lugar nenhum. '' = kit sem componente variável.
  combinacao text NOT NULL,
  preco numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kit_tamanho_preco_uk UNIQUE (kit_id, combinacao)
);

ALTER TABLE public.kit_tamanho_preco
  DROP CONSTRAINT IF EXISTS kit_tamanho_preco_nao_negativo_ck;
ALTER TABLE public.kit_tamanho_preco
  ADD CONSTRAINT kit_tamanho_preco_nao_negativo_ck CHECK (preco >= 0);

CREATE INDEX IF NOT EXISTS kit_tamanho_preco_kit_idx
  ON public.kit_tamanho_preco (kit_id);

-- ------------------------------------------------------------
-- (2) PREÇO DE MARKETPLACE
--
-- O eixo novo é o CANAL, não a conta. `contas_marketplace` é por conta
-- (Conta 1, Conta 3 do ML) e existe pras remessas Full; o preço do anúncio é
-- do canal inteiro. Os valores espelham as chaves de `MARKETPLACE_LABEL` em
-- src/lib/validators/vendas.ts, que é o mesmo vocabulário que
-- `vendas_marketplace.marketplace` já usa — nada de um terceiro cadastro de
-- marketplace.
--
-- `vendas_atacado` fica FORA do CHECK de propósito, apesar de existir em
-- MARKETPLACE_LABEL: "preço de marketplace do canal atacado" é precisamente
-- a confusão que a regra de ouro no topo manda evitar. Atacado tem tabela
-- própria, a da migration 38.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.produto_tamanho_preco_marketplace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos (id) ON DELETE CASCADE,
  -- Sem cascata, igual à de atacado: apagar tamanho com preço cadastrado
  -- deve falhar e doer.
  tamanho_id uuid NOT NULL REFERENCES public.tamanhos (id),
  marketplace text NOT NULL,
  preco numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produto_tamanho_preco_mkt_uk
    UNIQUE (produto_id, tamanho_id, marketplace)
);

CREATE TABLE IF NOT EXISTS public.kit_tamanho_preco_marketplace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES public.kits (id) ON DELETE CASCADE,
  -- MESMA regra de chave da tabela de atacado acima. Se as duas divergirem,
  -- um preço cadastrado vira inalcançável sem ninguém perceber.
  combinacao text NOT NULL,
  marketplace text NOT NULL,
  preco numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kit_tamanho_preco_mkt_uk UNIQUE (kit_id, combinacao, marketplace)
);

ALTER TABLE public.produto_tamanho_preco_marketplace
  DROP CONSTRAINT IF EXISTS produto_tamanho_preco_mkt_canal_ck;
ALTER TABLE public.produto_tamanho_preco_marketplace
  ADD CONSTRAINT produto_tamanho_preco_mkt_canal_ck
  CHECK (marketplace IN ('mercado_livre','shopee','shein','tiktok','temu','amazon'));

ALTER TABLE public.kit_tamanho_preco_marketplace
  DROP CONSTRAINT IF EXISTS kit_tamanho_preco_mkt_canal_ck;
ALTER TABLE public.kit_tamanho_preco_marketplace
  ADD CONSTRAINT kit_tamanho_preco_mkt_canal_ck
  CHECK (marketplace IN ('mercado_livre','shopee','shein','tiktok','temu','amazon'));

ALTER TABLE public.produto_tamanho_preco_marketplace
  DROP CONSTRAINT IF EXISTS produto_tamanho_preco_mkt_nao_negativo_ck;
ALTER TABLE public.produto_tamanho_preco_marketplace
  ADD CONSTRAINT produto_tamanho_preco_mkt_nao_negativo_ck CHECK (preco >= 0);

ALTER TABLE public.kit_tamanho_preco_marketplace
  DROP CONSTRAINT IF EXISTS kit_tamanho_preco_mkt_nao_negativo_ck;
ALTER TABLE public.kit_tamanho_preco_marketplace
  ADD CONSTRAINT kit_tamanho_preco_mkt_nao_negativo_ck CHECK (preco >= 0);

-- A tela carrega a grade inteira de uma vez (são ~126 linhas), mas filtra por
-- marketplace. O UNIQUE já cobre a busca por dono.
CREATE INDEX IF NOT EXISTS produto_tamanho_preco_mkt_canal_idx
  ON public.produto_tamanho_preco_marketplace (marketplace);
CREATE INDEX IF NOT EXISTS kit_tamanho_preco_mkt_canal_idx
  ON public.kit_tamanho_preco_marketplace (marketplace);

-- --------------------------------------------------------------
-- RLS — espelha a migration 38: catálogo. Leitura pra autenticado, escrita
-- pra gerência. O app não depende disto (tudo passa por requireArea); estas
-- policies só limitam acesso direto à API REST do Supabase.
-- --------------------------------------------------------------
ALTER TABLE public.produto_tamanho_preco_marketplace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_tamanho_preco_marketplace ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS produto_tamanho_preco_mkt_select ON public.produto_tamanho_preco_marketplace;
CREATE POLICY produto_tamanho_preco_mkt_select ON public.produto_tamanho_preco_marketplace
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS produto_tamanho_preco_mkt_manager ON public.produto_tamanho_preco_marketplace;
CREATE POLICY produto_tamanho_preco_mkt_manager ON public.produto_tamanho_preco_marketplace
  FOR ALL TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS kit_tamanho_preco_mkt_select ON public.kit_tamanho_preco_marketplace;
CREATE POLICY kit_tamanho_preco_mkt_select ON public.kit_tamanho_preco_marketplace
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS kit_tamanho_preco_mkt_manager ON public.kit_tamanho_preco_marketplace;
CREATE POLICY kit_tamanho_preco_mkt_manager ON public.kit_tamanho_preco_marketplace
  FOR ALL TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());

-- A de atacado foi recriada acima e perdeu as policies junto.
ALTER TABLE public.kit_tamanho_preco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kit_tamanho_preco_select_authenticated ON public.kit_tamanho_preco;
CREATE POLICY kit_tamanho_preco_select_authenticated ON public.kit_tamanho_preco
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS kit_tamanho_preco_manager_all ON public.kit_tamanho_preco;
CREATE POLICY kit_tamanho_preco_manager_all ON public.kit_tamanho_preco
  FOR ALL TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());

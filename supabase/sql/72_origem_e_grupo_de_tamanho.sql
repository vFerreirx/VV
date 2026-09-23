-- ============================================================
-- 72_origem_e_grupo_de_tamanho.sql
-- PRODUTO COMPRADO DE PARCEIRO, E TAMANHO POR GRUPO. Nasceu do SUÉTER, o
-- primeiro produto que a fábrica NÃO produz.
--
-- Medido em 23/09/2026:
--   - "SUETER GOLA V" (aa0f11e2-…) tem 18 variações (3 cores × PP..G1), é
--     REVENDA (um parceiro produz) e o sistema o oferecia na Nova OP, no kit,
--     no Full e na reposição → OP.
--   - Os 6 tamanhos de roupa entraram no MESMO cadastro de Casal/King/45x45:
--     o gerador de variações mostrava os 14 pra todo produto.
--   - O modelo foi renomeado de "SUETER GOLA V" pra "SUETER" e as 18
--     variações ficaram com o nome velho — a variação guarda o nome em TEXTO.
--
-- ⚠️ A CARGA DE DADOS RODA UMA VEZ SÓ, quando a coluna nasce. O `db:setup`
-- roda todo arquivo de novo a cada vez: um UPDATE solto aqui desfaria, em
-- silêncio, o que o Willian ajustar depois pela tela (mover um tamanho de
-- grupo, renomear o modelo). Mesmo princípio do ON CONFLICT DO NOTHING da 39.
--
-- ⚠️ O ESTADO 'pedido_parceiro' DA REPOSIÇÃO NÃO ESTÁ AQUI, e sim no CHECK
-- da própria 59: a 59 faz DROP+ADD do CHECK de estado em todo setup e, se o
-- valor novo entrasse só aqui, o setup seguinte recolocaria o CHECK antigo e
-- falharia assim que existisse um item pedido ao parceiro. Aqui ficam só as
-- colunas novas e o CHECK que depende delas.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tamanho ganha GRUPO: 'casa' (cama, mesa, almofada) ou 'vestuario'.
-- O produto diz de qual grupo é, e a tela do produto só oferece os tamanhos
-- do grupo dele (mais os que ele já usa — src/lib/produtos/grupo-de-tamanho.ts).
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tamanhos'
       AND column_name = 'grupo'
  ) THEN
    ALTER TABLE public.tamanhos
      ADD COLUMN grupo text NOT NULL DEFAULT 'casa';
    -- Os 6 tamanhos de roupa cadastrados em 22/09/2026.
    UPDATE public.tamanhos
       SET grupo = 'vestuario'
     WHERE lower(btrim(nome)) IN ('pp', 'p', 'm', 'g', 'gg', 'g1');
  END IF;
END $$;

ALTER TABLE public.tamanhos DROP CONSTRAINT IF EXISTS tamanhos_grupo_ck;
ALTER TABLE public.tamanhos
  ADD CONSTRAINT tamanhos_grupo_ck CHECK (grupo IN ('casa', 'vestuario'));

-- ------------------------------------------------------------
-- 2. Produto ganha ORIGEM e GRUPO DE TAMANHO.
--
-- 'producao' = a fábrica produz; 'parceiro' = comprado pronto de um parceiro,
-- e NUNCA vira OP (a guarda é das actions: src/lib/db/origem-do-produto.ts).
-- Não existe cadastro de fornecedor: é UM parceiro só. Se vier o segundo, é
-- aqui que ele entra — um `parceiro_id` ao lado da origem.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'produtos'
       AND column_name = 'origem'
  ) THEN
    ALTER TABLE public.produtos
      ADD COLUMN IF NOT EXISTS grupo_tamanho text NOT NULL DEFAULT 'casa';
    ALTER TABLE public.produtos
      ADD COLUMN origem text NOT NULL DEFAULT 'producao';

    -- O suéter, PELO ID e não pelo nome: ele vai ser renomeado.
    UPDATE public.produtos
       SET grupo_tamanho = 'vestuario', origem = 'parceiro'
     WHERE id = 'aa0f11e2-7433-4d7a-b573-cf65b5800144';

    -- As 18 variações dele voltam ao nome que o modelo tem no cadastro. Daqui
    -- pra frente, renomear o modelo pela tela leva as variações junto
    -- (modelos/actions.ts). O SKU não muda.
    UPDATE public.variacoes_produto
       SET modelo = 'SUETER'
     WHERE produto_id = 'aa0f11e2-7433-4d7a-b573-cf65b5800144'
       AND modelo = 'SUETER GOLA V';
  END IF;
END $$;

ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_origem_ck;
ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_origem_ck CHECK (origem IN ('producao', 'parceiro'));

ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_grupo_tamanho_ck;
ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_grupo_tamanho_ck
  CHECK (grupo_tamanho IN ('casa', 'vestuario'));

-- ------------------------------------------------------------
-- 3. Reposição de produto de parceiro: "Pedir ao parceiro" grava quem e
-- quando; "Chegou" leva a 'reposto' SEM OP.
-- ------------------------------------------------------------
ALTER TABLE public.reposicoes_estoque
  ADD COLUMN IF NOT EXISTS pedido_parceiro_em timestamptz;
ALTER TABLE public.reposicoes_estoque
  ADD COLUMN IF NOT EXISTS pedido_parceiro_por uuid REFERENCES public.users (id);

-- Pedido ao parceiro tem data e autor juntos; 'pedido_parceiro' exige o
-- pedido; e 'reposto' sem OP só existe se veio do parceiro — senão seria um
-- item dado como reposto sem ninguém ter produzido nem pedido nada.
ALTER TABLE public.reposicoes_estoque
  DROP CONSTRAINT IF EXISTS reposicoes_estoque_parceiro_ck;
ALTER TABLE public.reposicoes_estoque
  ADD CONSTRAINT reposicoes_estoque_parceiro_ck
  CHECK (
    (pedido_parceiro_em IS NULL) = (pedido_parceiro_por IS NULL)
    AND (estado <> 'pedido_parceiro' OR pedido_parceiro_em IS NOT NULL)
    AND (estado <> 'reposto' OR ordem_id IS NOT NULL OR pedido_parceiro_em IS NOT NULL)
  );

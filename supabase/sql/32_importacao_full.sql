-- ============================================================
-- 32_importacao_full.sql
-- Importação de envio Full por PDF (ML / Shopee).
--
-- `de_para_full` responde uma pergunta só: dado o CÓDIGO que veio no PDF
-- do envio, O QUE A FÁBRICA PRODUZ. Aprende uma vez e reusa nos envios
-- seguintes — é o que faz o segundo envio não ter trabalho nenhum.
--
-- Ancorado no CÓDIGO (Código ML / Shopee SKU ID), não no SKU: o código é
-- estável entre envios, enquanto o SKU no PDF do ML vem TRUNCADO em 50
-- caracteres ("...CAQUI-AMBAR-DOURA").
--
-- Guarda COMPONENTES e não kit_id porque o kit do sistema é molde SEM COR
-- ("Kit Manta + 2 Capas - SIENA") e o envio traz a combinação de cores.
-- Cobre também o item avulso (1 componente) e o caso sem kit cadastrado.
--
-- Idempotente. Só aditivo (CREATE TABLE / CREATE INDEX / ADD COLUMN).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.de_para_full (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Reusa ordem_canal_destino; na prática só full_ml/full_shopee entram
  -- (validado no zod, como em remessas_full).
  canal ordem_canal_destino NOT NULL,
  -- Código lido do PDF: "WLJX97155" (ML) /
  -- "47807599234_405675050747" (Shopee). É a CHAVE.
  codigo text NOT NULL,

  -- Kit que originou o mapeamento, só pra referência: pré-seleciona o kit
  -- quando alguém reabre pra editar. NÃO é a fonte da verdade — valem os
  -- componentes gravados, mesmo que o kit mude ou seja excluído depois.
  kit_id uuid REFERENCES public.kits (id) ON DELETE SET NULL,

  -- SKU e descrição VISTOS no PDF no momento do mapeamento. Servem só pra
  -- detectar que o item mudou desde então (dá pra editar o anúncio no
  -- marketplace mantendo o mesmo código) — não casam nada.
  sku_visto text,
  descricao_vista text,

  observacao text,
  criado_por uuid REFERENCES public.users (id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Um mapeamento por (canal, código) entre os não-excluídos.
CREATE UNIQUE INDEX IF NOT EXISTS de_para_full_codigo_uidx
  ON public.de_para_full (canal, codigo)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.de_para_full_componentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  de_para_id uuid NOT NULL
    REFERENCES public.de_para_full (id) ON DELETE CASCADE,
  variacao_id uuid NOT NULL
    REFERENCES public.variacoes_produto (id),
  -- Peças por UNIDADE do envio (kit com 2 capas = 2).
  quantidade integer NOT NULL DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS de_para_full_comp_pai_idx
  ON public.de_para_full_componentes (de_para_id);
CREATE INDEX IF NOT EXISTS de_para_full_comp_variacao_idx
  ON public.de_para_full_componentes (variacao_id);

-- ------------------------------------------------------------
-- Identificador do envio na remessa — impede importar o mesmo envio 2x.
-- ML: "72785017" (Frete #). Shopee: "INBRFSP12607220343" (ASN ID lido do
-- documento; o FBSINBR do nome do arquivo NÃO aparece no Picking List).
-- ------------------------------------------------------------
ALTER TABLE public.remessas_full
  ADD COLUMN IF NOT EXISTS envio_id text;

CREATE UNIQUE INDEX IF NOT EXISTS remessas_full_envio_uidx
  ON public.remessas_full (canal, envio_id)
  WHERE envio_id IS NOT NULL AND deleted_at IS NULL;

-- ------------------------------------------------------------
-- RLS — mesmo padrão de remessas_full (26): leitura autenticada, escrita
-- de gerência. É dado de produção, não dado pessoal.
--
-- ⚠️ Piso grosseiro de defesa em profundidade, NÃO espelho do nivelPadrao
-- de AREAS. Quem manda na permissão é o app (requireAreaEscrita('ordens')).
-- Ver "Divergências conhecidas" em supabase/PLANO-RLS.md.
-- ------------------------------------------------------------
ALTER TABLE public.de_para_full ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.de_para_full_componentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS de_para_full_select ON public.de_para_full;
CREATE POLICY de_para_full_select ON public.de_para_full
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS de_para_full_manager_write ON public.de_para_full;
CREATE POLICY de_para_full_manager_write ON public.de_para_full
  FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

DROP POLICY IF EXISTS de_para_full_comp_select ON public.de_para_full_componentes;
CREATE POLICY de_para_full_comp_select ON public.de_para_full_componentes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS de_para_full_comp_manager_write ON public.de_para_full_componentes;
CREATE POLICY de_para_full_comp_manager_write ON public.de_para_full_componentes
  FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

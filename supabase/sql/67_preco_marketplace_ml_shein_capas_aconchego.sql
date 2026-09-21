-- ============================================================
-- 67_preco_marketplace_ml_shein_capas_aconchego.sql
-- FECHA O ML E A SHEIN: os 3 pares que só tinham anúncio na Shopee.
--
-- Eram os três tamanhos da capa ACONCHEGO, os únicos pares do catálogo com
-- anúncio em uns canais e não em outros:
--
--   Capa de Almofada - ACONCHEGO / 45x45   69,99  (atacado 25,00)
--   Capa de Almofada - ACONCHEGO / 50x50   79,99  (atacado 30,00)
--   Capa de Almofada - ACONCHEGO / 60x60   89,99  (atacado 35,00)
--
-- Copiados da Shopee, como foi feito com TikTok e Amazon na carga 62 — e com
-- a mesma ressalva: é PONTO DE PARTIDA. O ML e a Shein cobram comissão
-- diferente da Shopee, e é esperado que estes três sejam ajustados na tela.
--
-- ⚠️ A CONSULTA COPIA TODA LINHA DA SHOPEE que ainda não existe no canal de
-- destino, e não só estas três. É o mesmo efeito hoje (só faltam elas), e
-- continua certo amanhã: se entrar produto novo pela Shopee, o `db:setup`
-- seguinte espelha nos dois. O que já existe não é tocado, porque o
-- ON CONFLICT é DO NOTHING — nunca UPSERT.
--
-- ⚠️ Preço de ANÚNCIO. Nunca entra em pedido de atacado — ver o topo de
-- src/lib/preco-marketplace.ts.
--
-- Idempotente. Só aditivo.
-- ============================================================

INSERT INTO public.produto_tamanho_preco_marketplace
  (produto_id, tamanho_id, marketplace, preco)
SELECT x.produto_id, x.tamanho_id, canal.nome, x.preco
FROM public.produto_tamanho_preco_marketplace x
CROSS JOIN (VALUES ('mercado_livre'), ('shein')) AS canal(nome)
WHERE x.marketplace = 'shopee'
ON CONFLICT (produto_id, tamanho_id, marketplace) DO NOTHING;

-- Kits: hoje os 29 já estão nos cinco canais, então isto não escreve nada.
-- Fica pelo mesmo motivo do de cima — kit novo cadastrado só na Shopee passa
-- a ser espelhado sozinho.
INSERT INTO public.kit_tamanho_preco_marketplace
  (kit_id, combinacao, marketplace, preco)
SELECT x.kit_id, x.combinacao, canal.nome, x.preco
FROM public.kit_tamanho_preco_marketplace x
CROSS JOIN (VALUES ('mercado_livre'), ('shein')) AS canal(nome)
WHERE x.marketplace = 'shopee'
ON CONFLICT (kit_id, combinacao, marketplace) DO NOTHING;

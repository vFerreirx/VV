-- ============================================================
-- 62_preco_marketplace_tiktok_amazon.sql
-- ANÚNCIO DO TIKTOK E DA AMAZON: começa igual ao da Shopee.
--
-- Os dois canais vendem todo dia (TikTok: 6.061 peças em 95 dias; Amazon:
-- 844 em 273) e não tinham NENHUM preço de anúncio cadastrado — a coluna
-- existia na tela e estava vazia inteira. Sem preço ali, a tela de conferência
-- não serve pra conferir esses dois: não há com o que comparar o que está
-- publicado na plataforma.
--
-- A Shopee é o ponto de partida porque é a tabela mais completa (20 produtos +
-- 25 kits contra 17 + 25 do ML e da Shein).
--
-- ⚠️ ISTO É PONTO DE PARTIDA, NÃO VERDADE. Cada plataforma cobra comissão
-- diferente, e o preço de anúncio embute essa comissão — é esperado que estes
-- números sejam ajustados na tela /precos-marketplace assim que alguém
-- comparar com o que está publicado de verdade.
--
-- ⚠️ ON CONFLICT DO NOTHING, nunca UPSERT: no próximo `db:setup` este arquivo
-- roda de novo, e um UPSERT faria o preço ajustado à mão voltar ao da Shopee
-- em silêncio. DO NOTHING só preenche buraco.
--
-- ⚠️ E NADA DISSO É PREÇO DE PEDIDO. Preço de anúncio nunca entra num pedido
-- de atacado — ver o topo de src/lib/preco-marketplace.ts.
--
-- Idempotente. Só aditivo: nada de UPDATE, DELETE ou TRUNCATE.
-- ============================================================

-- Produtos: 20 linhas da Shopee → 20 no TikTok + 20 na Amazon.
INSERT INTO public.produto_tamanho_preco_marketplace
  (produto_id, tamanho_id, marketplace, preco)
SELECT x.produto_id, x.tamanho_id, canal.nome, x.preco
FROM public.produto_tamanho_preco_marketplace x
CROSS JOIN (VALUES ('tiktok'), ('amazon')) AS canal(nome)
WHERE x.marketplace = 'shopee'
ON CONFLICT (produto_id, tamanho_id, marketplace) DO NOTHING;

-- Kits: 25 combinações da Shopee → 25 no TikTok + 25 na Amazon.
-- A chave é a COMBINAÇÃO de tamanhos, copiada como está: ela já foi gravada
-- canônica por `chaveDeTamanhos` e conferida por
-- scripts/analise/conferir-carga-marketplace.ts.
INSERT INTO public.kit_tamanho_preco_marketplace
  (kit_id, combinacao, marketplace, preco)
SELECT x.kit_id, x.combinacao, canal.nome, x.preco
FROM public.kit_tamanho_preco_marketplace x
CROSS JOIN (VALUES ('tiktok'), ('amazon')) AS canal(nome)
WHERE x.marketplace = 'shopee'
ON CONFLICT (kit_id, combinacao, marketplace) DO NOTHING;

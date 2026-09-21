-- ============================================================
-- 65_preco_marketplace_peseiras_pienza_ravena.sql
-- ANÚNCIO DAS PESEIRAS PIENZA e RAVENA e dos kits delas.
--
-- Fecha a linha PIENZA/RAVENA, que estava sem anúncio em canal nenhum. Os
-- números repetem os das mantas, ditados pelo dono em 21/09/2026, IGUAL NOS
-- CINCO CANAIS:
--
--   Peseira - PIENZA / Queen                     69,99   (atacado 60,00)
--   Peseira - RAVENA / Queen                     69,99   (atacado 60,00)
--   Kit Peseira+ 2 Capas de Almofada - PIENZA   119,99
--   Kit Peseira+ 2 Capas de Almofada - RAVENA   119,99
--
-- Conferido contra o atacado antes de gravar: as duas peseiras ficam 9,99
-- ACIMA do preço de tabela, ao contrário do que aconteceu na carga 63 com as
-- mantas (corrigida pela 64).
--
-- ⚠️ ESTES DOIS KITS SAEM MAIS BARATOS que os outros kits peseira + 2 capas
-- já anunciados (RELEVO 129,99, TRANÇAS 139,99, ACONCHEGO 149,99). Foi
-- escolha do dono, com os outros números à vista — não "corrija" pra alinhar.
--
-- ⚠️ A COMBINAÇÃO É '' (texto vazio) porque nenhum componente é variável: a
-- capa só existe em 45x45 e a peseira só em Queen. Chave válida, a mesma dos
-- kits de uma combinação só que já estão no banco.
--
-- ⚠️ ON CONFLICT DO NOTHING, nunca UPSERT: o arquivo roda de novo a cada
-- `db:setup` e não desfaz ajuste feito à mão na tela.
--
-- ⚠️ Preço de ANÚNCIO. Nunca entra em pedido de atacado — ver o topo de
-- src/lib/preco-marketplace.ts.
--
-- Idempotente. Só aditivo.
-- ============================================================

INSERT INTO public.produto_tamanho_preco_marketplace
  (produto_id, tamanho_id, marketplace, preco)
SELECT p.id, t.id, canal.nome, alvo.preco
FROM (VALUES
  ('Peseira - PIENZA', 'Queen', 69.99),
  ('Peseira - RAVENA', 'Queen', 69.99)
) AS alvo(produto, tamanho, preco)
JOIN public.produtos p
  ON lower(trim(p.nome)) = lower(trim(alvo.produto)) AND p.deleted_at IS NULL
JOIN public.tamanhos t
  ON lower(trim(t.nome)) = lower(trim(alvo.tamanho)) AND t.deleted_at IS NULL
CROSS JOIN (VALUES
  ('mercado_livre'), ('shopee'), ('shein'), ('tiktok'), ('amazon')
) AS canal(nome)
ON CONFLICT (produto_id, tamanho_id, marketplace) DO NOTHING;

INSERT INTO public.kit_tamanho_preco_marketplace
  (kit_id, combinacao, marketplace, preco)
SELECT k.id, '', canal.nome, alvo.preco
FROM (VALUES
  ('Kit Peseira+ 2 Capas de Almofada - PIENZA', 119.99),
  ('Kit Peseira+ 2 Capas de Almofada - RAVENA', 119.99)
) AS alvo(kit, preco)
JOIN public.kits k
  ON lower(trim(k.nome)) = lower(trim(alvo.kit)) AND k.deleted_at IS NULL
CROSS JOIN (VALUES
  ('mercado_livre'), ('shopee'), ('shein'), ('tiktok'), ('amazon')
) AS canal(nome)
ON CONFLICT (kit_id, combinacao, marketplace) DO NOTHING;

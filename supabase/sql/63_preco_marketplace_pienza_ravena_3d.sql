-- ============================================================
-- 63_preco_marketplace_pienza_ravena_3d.sql
-- ANÚNCIO DAS LINHAS QUE FALTAVAM: PIENZA, RAVENA e a Manta 3D.
--
-- Preços ditados pelo dono em 21/09/2026, um número por item, IGUAL NOS CINCO
-- CANAIS — que é o padrão dos kits que já estavam cadastrados (o Kit RELEVO
-- está 129,99 no ML, Shopee, Shein, TikTok e Amazon).
--
--   Manta - 3D / Manta                          54,99
--   Manta - PIENZA / Manta                      69,99  (era 59,99; ver 64)
--   Manta - RAVENA / Manta                      69,99  (era 59,99; ver 64)
--   Capa de Almofada - PIENZA / 45x45           59,99
--   Capa de Almofada - RAVENA / 45x45           59,99
--   Kit Manta + 2 Capas de Almofada - PIENZA   119,99
--   Kit Manta+ 2 Capas de Almofada - RAVENA    119,99
--
-- ⚠️ A MANTA 3D FICA ABAIXO DO ATACADO DE PROPÓSITO: 54,99 de anúncio contra
-- 59,99 de tabela. Foi decisão do dono, avisado da diferença — a conferência
-- de scripts/analise/auditoria-catalogo.ts vai continuar acusando essa linha,
-- e é assim mesmo. Não "corrija" sem perguntar.
--
-- ⚠️ A COMBINAÇÃO DOS KITS É '' (texto vazio), e isso é chave VÁLIDA: os dois
-- kits têm capa só em 45x45 e manta só em "Manta", ou seja, nenhum componente
-- variável — `chaveDeTamanhos` devolve '' nesse caso. É a mesma chave dos kits
-- de uma combinação só que já estão no banco (RELEVO, TRANÇAS, SIENA).
--
-- ⚠️ ON CONFLICT DO NOTHING, nunca UPSERT: o arquivo roda de novo a cada
-- `db:setup`, e um UPSERT desfaria ajuste feito à mão na tela.
--
-- ⚠️ Preço de ANÚNCIO. Nunca entra em pedido de atacado — ver o topo de
-- src/lib/preco-marketplace.ts.
--
-- Idempotente. Só aditivo: nada de UPDATE, DELETE ou TRUNCATE.
-- ============================================================

-- ── Produtos ──────────────────────────────────────────────────
-- O par (produto, tamanho) é resolvido por NOME, que é como o catálogo se
-- conhece; o CROSS JOIN espalha o mesmo preço pelos cinco canais.
INSERT INTO public.produto_tamanho_preco_marketplace
  (produto_id, tamanho_id, marketplace, preco)
SELECT p.id, t.id, canal.nome, alvo.preco
FROM (VALUES
  ('Manta - 3D',                 'Manta', 54.99),
  ('Manta - PIENZA',             'Manta', 69.99),
  ('Manta - RAVENA',             'Manta', 69.99),
  ('Capa de Almofada - PIENZA',  '45x45', 59.99),
  ('Capa de Almofada - RAVENA',  '45x45', 59.99)
) AS alvo(produto, tamanho, preco)
JOIN public.produtos p
  ON lower(trim(p.nome)) = lower(trim(alvo.produto)) AND p.deleted_at IS NULL
JOIN public.tamanhos t
  ON lower(trim(t.nome)) = lower(trim(alvo.tamanho)) AND t.deleted_at IS NULL
CROSS JOIN (VALUES
  ('mercado_livre'), ('shopee'), ('shein'), ('tiktok'), ('amazon')
) AS canal(nome)
ON CONFLICT (produto_id, tamanho_id, marketplace) DO NOTHING;

-- ── Kits ──────────────────────────────────────────────────────
INSERT INTO public.kit_tamanho_preco_marketplace
  (kit_id, combinacao, marketplace, preco)
SELECT k.id, '', canal.nome, alvo.preco
FROM (VALUES
  ('Kit Manta + 2 Capas de Almofada - PIENZA', 119.99),
  ('Kit Manta+ 2 Capas de Almofada - RAVENA',  119.99)
) AS alvo(kit, preco)
JOIN public.kits k
  ON lower(trim(k.nome)) = lower(trim(alvo.kit)) AND k.deleted_at IS NULL
CROSS JOIN (VALUES
  ('mercado_livre'), ('shopee'), ('shein'), ('tiktok'), ('amazon')
) AS canal(nome)
ON CONFLICT (kit_id, combinacao, marketplace) DO NOTHING;

-- ============================================================
-- 66_preco_marketplace_capas_almofada.sql
-- ANÚNCIO DAS CAPAS DE ALMOFADA que faltavam — as últimas 10 do catálogo.
--
-- Dois números, ditados pelo dono em 21/09/2026 a partir do preço de tabela,
-- IGUAIS NOS CINCO CANAIS:
--
--   capa com atacado 20,00  →  49,99
--   capa com atacado 25,00  →  59,99
--
-- ⚠️ A LISTA É EXPLÍCITA, e não "toda capa com atacado 20,00". A regra veio do
-- preço de tabela, mas gravá-la como consulta faria este arquivo mudar de
-- alvo sozinho no dia em que alguém reajustar o atacado — e ele roda de novo
-- a cada `db:setup`. Aqui, o que está escrito é o que entra.
--
-- Conferido contra o atacado antes de gravar: 49,99 fica 29,99 acima da
-- tabela; 59,99 fica 34,99 acima. Nenhum abaixo.
--
-- ⚠️ ON CONFLICT DO NOTHING, nunca UPSERT: ajuste feito na tela não volta
-- atrás no próximo setup.
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
  -- atacado 20,00
  ('Capa de Almofada - 3D',                 '45x45',   49.99),
  ('Capa de Almofada - ARAN',               '45x45',   49.99),
  ('Capa de Almofada - LINKS',              '45x45',   49.99),
  ('Capa de Almofada - RELEVO',             '45x45',   49.99),
  ('Capa de Almofada - TRANÇAS',            '45x45',   49.99),
  ('Capa de Almofada Baguete - ARAN',       'Baguete', 49.99),
  -- atacado 25,00
  ('Capa de Almofada - SIENA',              '45x45',   59.99),
  ('Capa de Almofada - SOFISTICADA',        '45x45',   59.99),
  ('Capa de Almofada - ACONCHEGO',          'Baguete', 59.99),
  ('Capa de Almofada Baguete - SOFISTICADA','Baguete', 59.99)
) AS alvo(produto, tamanho, preco)
JOIN public.produtos p
  ON lower(trim(p.nome)) = lower(trim(alvo.produto)) AND p.deleted_at IS NULL
JOIN public.tamanhos t
  ON lower(trim(t.nome)) = lower(trim(alvo.tamanho)) AND t.deleted_at IS NULL
CROSS JOIN (VALUES
  ('mercado_livre'), ('shopee'), ('shein'), ('tiktok'), ('amazon')
) AS canal(nome)
ON CONFLICT (produto_id, tamanho_id, marketplace) DO NOTHING;

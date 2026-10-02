-- ============================================================
-- 75_quantidade_da_reposicao.sql
-- QUANTAS PRODUZIR: quem marca a peça na prateleira já diz quantas (Q200,
-- 02/10). O gerente marca e, no mesmo diálogo, cria as OPs com essa
-- quantidade; a estoquista manda a peça pra fila com ela, e o "Produzir"
-- abre a Nova OP já preenchida.
--
-- NULA NAS LINHAS ANTIGAS, de antes da quantidade existir: a fila mostra só
-- "Acabou"/"Acabando", como sempre mostrou. A obrigatoriedade mora no
-- validador (src/lib/validators/reposicao.ts), não aqui — um NOT NULL
-- exigiria inventar número pras linhas antigas.
--
-- ⚠️ ORDEM DE PUBLICAÇÃO: esta migration ANTES do código que lê
-- `quantidade`. Com o código novo no ar sem a coluna, o /estoque cai.
--
-- Idempotente e só aditiva: nenhum UPDATE, DELETE ou DROP de dado. O
-- DROP+ADD do CHECK é o mesmo arranjo da 59: rodar de novo recoloca a
-- mesma regra.
-- ============================================================

ALTER TABLE public.reposicoes_estoque
  ADD COLUMN IF NOT EXISTS quantidade integer;

ALTER TABLE public.reposicoes_estoque
  DROP CONSTRAINT IF EXISTS reposicoes_estoque_quantidade_ck;
ALTER TABLE public.reposicoes_estoque
  ADD CONSTRAINT reposicoes_estoque_quantidade_ck
  CHECK (quantidade IS NULL OR quantidade >= 1);

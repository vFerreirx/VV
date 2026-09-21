-- ============================================================
-- 64_preco_marketplace_mantas_pienza_ravena.sql
-- CORREÇÃO: mantas PIENZA e RAVENA de 59,99 pra 69,99 no anúncio.
--
-- A carga 63 gravou 59,99, e o ATACADO dessas duas é 60,00 — o anúncio saía
-- um centavo abaixo do preço de tabela, antes ainda da comissão da
-- plataforma. Corrigido pelo dono em 21/09/2026 pra 69,99, que é a faixa das
-- outras mantas (ACONCHEGO 69,99 na Shopee).
--
-- ⚠️ ESTE É O RARO CASO DE UPDATE NUMA CARGA, e ele é GUARDADO: só mexe na
-- linha que ainda está em 59,99. Quem ajustar o preço na tela depois não vê o
-- valor voltar no próximo `db:setup` — o UPDATE simplesmente não acha nada
-- pra fazer. A 63 também foi corrigida, pra um banco novo já nascer com
-- 69,99.
--
-- Idempotente: rodar de novo não muda nada.
-- ============================================================

UPDATE public.produto_tamanho_preco_marketplace x
SET preco = 69.99
FROM public.produtos p, public.tamanhos t
WHERE p.id = x.produto_id
  AND t.id = x.tamanho_id
  AND lower(trim(p.nome)) IN ('manta - pienza', 'manta - ravena')
  AND lower(trim(t.nome)) = 'manta'
  AND x.preco = 59.99;

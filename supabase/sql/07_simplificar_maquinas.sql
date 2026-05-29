-- ============================================================
-- 07_simplificar_maquinas.sql
-- Simplifica a tabela maquinas: remove specs técnicas de tear
-- (diâmetro, finura, alimentadores, capacidade), o campo `tipo`
-- e as datas de manutenção. Máquina passa a ser: codigo, nome,
-- status, operador_atual_id, observacoes.
--
-- Idempotente: DROP ... IF EXISTS. Pode rodar várias vezes.
-- ============================================================

-- Remove specs técnicas
ALTER TABLE public.maquinas DROP COLUMN IF EXISTS diametro_polegadas;
ALTER TABLE public.maquinas DROP COLUMN IF EXISTS finura;
ALTER TABLE public.maquinas DROP COLUMN IF EXISTS num_alimentadores;
ALTER TABLE public.maquinas DROP COLUMN IF EXISTS capacidade_kg_por_hora;

-- Remove manutenção
ALTER TABLE public.maquinas DROP COLUMN IF EXISTS ultima_manutencao;
ALTER TABLE public.maquinas DROP COLUMN IF EXISTS proxima_manutencao;

-- Remove o campo tipo + índice associado
DROP INDEX IF EXISTS public.maquinas_tipo_idx;
ALTER TABLE public.maquinas DROP COLUMN IF EXISTS tipo;

-- Remove o enum maquina_tipo agora que nenhuma coluna o referencia
DROP TYPE IF EXISTS public.maquina_tipo;

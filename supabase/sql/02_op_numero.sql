-- ============================================================
-- 02_op_numero.sql
-- Numeração sequencial de Ordens de Produção: OP-AAAA-NNNN
-- (resetando NNNN a cada ano).
-- Implementação:
--   - Tabela contadora op_numero_counter (uma linha por ano)
--   - Função generate_op_numero() (BEFORE INSERT) que faz upsert atômico
--     no contador e formata o número.
-- A coluna ordens_producao.numero permanece NOT NULL: a server action
-- insere com placeholder ('') e o trigger sobrescreve.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.op_numero_counter (
  ano integer PRIMARY KEY,
  ultimo_numero integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.generate_op_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ano_atual integer;
  proximo integer;
BEGIN
  ano_atual := EXTRACT(YEAR FROM now() AT TIME ZONE 'UTC')::integer;

  -- Upsert atômico: cria linha do ano se não existe, ou incrementa.
  INSERT INTO public.op_numero_counter (ano, ultimo_numero)
  VALUES (ano_atual, 1)
  ON CONFLICT (ano) DO UPDATE
    SET ultimo_numero = public.op_numero_counter.ultimo_numero + 1
  RETURNING ultimo_numero INTO proximo;

  NEW.numero := 'OP-' || ano_atual || '-' || LPAD(proximo::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ordens_producao_set_numero ON public.ordens_producao;

CREATE TRIGGER ordens_producao_set_numero
  BEFORE INSERT ON public.ordens_producao
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_op_numero();

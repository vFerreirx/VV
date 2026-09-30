-- ============================================================
-- 74_numero_da_maquina.sql
-- A MÁQUINA É UM NÚMERO: "Máquina 4", e não "TC-04".
--
-- Ninguém na fábrica fala "TC" (Q195-a, Q196-a, 30/09). A máquina aparece
-- como "Máquina 4" em todo lugar, e o nome é MONTADO a partir deste número
-- (`nomeDaMaquina`, src/lib/producao/nome-da-maquina.ts) — nunca digitado.
--
-- POR QUE UMA COLUNA NOVA, e não reaproveitar o `codigo`: o `codigo` é texto
-- e só ordena certo por causa do zero na frente ("TC-01"); e virar número
-- nele seria reescrever o valor que o histórico antigo cita. Com um inteiro,
-- o banco garante "número, >= 1, único" e a ordem numérica sai de graça.
--
-- ÚNICO SÓ ENTRE AS VIVAS: a Máquina 4 aposentada (na lixeira) não prende o
-- número; o gerente cadastra outra Máquina 4. Restaurar a velha da lixeira
-- é que é recusado ("Já existe a Máquina 4").
--
-- LEGADO, sem DROP:
--   - `codigo` continua NOT NULL UNIQUE, e nenhuma tela lê. Máquina nova
--     preenche com o próprio uuid (escondido, nunca colide — o índice dele é
--     global e pega as apagadas).
--   - `nome` continua NOT NULL e recebe o nome montado, como espelho. Também
--     ninguém lê.
--
-- ⚠️ ORDEM DE PUBLICAÇÃO: esta migration ANTES do código que lê `numero`.
-- Com o código novo no ar sem a coluna, toda tela que mostra máquina cai.
--
-- Idempotente: o UPDATE só preenche buraco, então rodar de novo não desfaz
-- o número que o gerente trocou.
-- ============================================================

ALTER TABLE public.maquinas ADD COLUMN IF NOT EXISTS numero integer;

-- Só preenche buraco: rodar de novo não mexe no número que o gerente trocou.
UPDATE public.maquinas
   SET numero = substring(codigo from '([0-9]+)$')::int
 WHERE numero IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.maquinas WHERE numero IS NULL) THEN
    RAISE EXCEPTION 'maquina sem numero: codigo sem digitos no fim';
  END IF;
END $$;

ALTER TABLE public.maquinas ALTER COLUMN numero SET NOT NULL;

ALTER TABLE public.maquinas DROP CONSTRAINT IF EXISTS maquinas_numero_positivo_ck;
ALTER TABLE public.maquinas ADD CONSTRAINT maquinas_numero_positivo_ck CHECK (numero >= 1);

-- Único ENTRE AS VIVAS (ver acima).
CREATE UNIQUE INDEX IF NOT EXISTS maquinas_numero_vivo_uidx
  ON public.maquinas (numero) WHERE deleted_at IS NULL;

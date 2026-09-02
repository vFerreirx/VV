-- ============================================================
-- 50_estacao_operadores.sql
-- Estação passa a ter ATÉ 3 OPERADORES, sem turno.
--
-- O conceito de dia/noite acabou. As colunas antigas
-- `estacoes.operador_dia_id` / `operador_noite_id` continuam existindo e
-- NÃO são dropadas de propósito: as 3 estações que existem no banco estão
-- soft-deleted (Turma 1/2/3) e aquelas colunas são o único registro de quem
-- formava cada turma. Mesmo tratamento de `produtos.peso_gramas` — legado,
-- não leia nem escreva.
--
-- ADITIVA. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.estacao_operadores (
  estacao_id  uuid NOT NULL REFERENCES public.estacoes (id) ON DELETE CASCADE,
  operador_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (estacao_id, operador_id)
);

-- Um operador pertence a UMA estação. É esta linha que impede o card do
-- kanban de duplicar quando a query junta OP -> responsável -> estação, e é
-- ela que dá sentido a "a estação do operador" no singular.
--
-- PK composta + UNIQUE separado (em vez de PRIMARY KEY (operador_id)) porque
-- se um dia a regra afrouxar pra "operador em duas estações", derruba-se o
-- índice e a tabela segue de pé. Derrubar PK é bem mais chato.
--
-- ⚠️ O ON DELETE CASCADE acima quase nunca dispara: `estacoes` e `users` usam
-- soft delete, então apagar na tela é UPDATE, não DELETE. Sem apagar o
-- vínculo na mão, este UNIQUE trava o operador contra uma linha fantasma de
-- estação já apagada e ele nunca mais entra em outra. Quem apaga de verdade é
-- `excluirEstacaoAction` (src/app/(app)/estacoes/actions.ts).
CREATE UNIQUE INDEX IF NOT EXISTS estacao_operadores_operador_uidx
  ON public.estacao_operadores (operador_id);

-- O limite de 3 operadores por estação NÃO está aqui de propósito: é regra de
-- negócio, não verdade do banco. Vive no Zod/action, e virar 4 é trocar um
-- número (src/lib/validators/estacoes.ts).

-- ------------------------------------------------------------
-- Uma máquina, uma OP em produção
-- ------------------------------------------------------------
-- Com o "Pegar pra mim" escolhendo máquina, dois operadores podem clicar na
-- mesma máquina no mesmo instante: a revalidação no servidor tem janela entre
-- o SELECT que confere e o UPDATE que grava. Este índice fecha a janela no
-- banco, que é o único lugar onde ela fecha de verdade.
--
-- O predicado é `status = 'em_producao'`, e não "status ativo": é o único
-- status em que a OP está FISICAMENTE na máquina. Se fosse "ativo", a OP
-- parada em `pronto_envio` seguiria segurando a máquina, e com o tempo as 24
-- máquinas ficariam todas "ocupadas" sem ninguém estar produzindo — o sistema
-- travaria sozinho. Ao mover pra pronto_envio, a máquina libera.
--
-- NULL não conflita com NULL em índice único, então OP sem máquina fica de
-- fora naturalmente; o `maquina_id IS NOT NULL` é só pra deixar explícito.
CREATE UNIQUE INDEX IF NOT EXISTS ordens_producao_maquina_em_producao_uidx
  ON public.ordens_producao (maquina_id)
  WHERE maquina_id IS NOT NULL
    AND deleted_at IS NULL
    AND status = 'em_producao';

-- ------------------------------------------------------------
-- Carga de transição: legado -> tabela nova
-- ------------------------------------------------------------
-- Estação VIVA cadastrada na tela antiga tem os operadores em
-- operador_dia_id/operador_noite_id. Sem esta carga ela apareceria "sem
-- operadores" depois do deploy, e o admin teria que recadastrar na mão.
--
-- ⚠️ O guarda "só se a tabela estiver VAZIA" é essencial, não é otimização.
-- `db:setup` roda muitas vezes. Sem ele, o dia em que o admin TIRAR um
-- operador da estação na tela nova, o próximo setup ressuscitaria o vínculo
-- a partir da coluna legado — em silêncio. Com o guarda, isto é uma ponte de
-- mão única: dispara no primeiro setup depois da migration, quando a tabela
-- nova ainda está vazia, e nunca mais.
--
-- Um `ON CONFLICT DO NOTHING` sozinho NÃO resolveria isso: ele evita erro de
-- linha duplicada, mas reinserir uma linha apagada de propósito não é
-- conflito nenhum. Ele fica aqui só pro caso do mesmo operador aparecer em
-- duas estações legadas — aí o UNIQUE decide, e a segunda é ignorada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.estacao_operadores) THEN
    INSERT INTO public.estacao_operadores (estacao_id, operador_id)
    SELECT e.id, v.operador_id
    FROM public.estacoes e
    CROSS JOIN LATERAL (
      VALUES (e.operador_dia_id), (e.operador_noite_id)
    ) AS v(operador_id)
    WHERE e.deleted_at IS NULL
      AND v.operador_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = v.operador_id AND u.deleted_at IS NULL
      )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ------------------------------------------------------------
-- RLS (mesmo padrão conservador das demais tabelas de domínio)
-- ------------------------------------------------------------
ALTER TABLE public.estacao_operadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estacao_operadores_select ON public.estacao_operadores;
CREATE POLICY estacao_operadores_select ON public.estacao_operadores
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS estacao_operadores_all ON public.estacao_operadores;
CREATE POLICY estacao_operadores_all ON public.estacao_operadores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

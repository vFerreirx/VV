-- ============================================================
-- 57_maquina_paradas.sql
-- O HISTÓRICO DE PARADAS DA MÁQUINA: por que parou, quando, quem registrou,
-- quando voltou e o que estava rodando na hora.
--
-- Hoje nada disso existe. `trocarStatusAction` faz um UPDATE seco em
-- `maquinas.status` — sem autor, sem hora, sem motivo —, e o único campo de
-- texto que a máquina tem (`observacoes`) é CADASTRO: o motivo de hoje apaga
-- o de ontem. Depois que a máquina volta, não sobra vestígio de que parou.
--
-- ⚠️ ISTO NÃO É AGENDA DE MANUTENÇÃO. A migration 07 removeu de propósito
-- `ultima_manutencao` e `proxima_manutencao` de `maquinas`, e elas não voltam
-- aqui: esta tabela registra o que ACONTECEU, nunca o que vai acontecer.
--
-- ⚠️ TAMBÉM NÃO É `apontamentos_producao.motivo_parada`. Aquela coluna existe
-- desde o 01, nunca foi lida nem escrita por ninguém, e é a casa errada: ela
-- pendura na OP, e a parada que interessa acontece na MÁQUINA — quase sempre
-- sem OP nenhuma rodando. Ela fica onde está; mexer nela seria DROP COLUMN em
-- tabela de produção por motivo estético.
--
-- ─────────────────────────────────────────────────────────────────────────
-- UMA LINHA POR PARADA, COM ABERTURA E FECHAMENTO
-- ─────────────────────────────────────────────────────────────────────────
--
-- A tabela irmã `eventos_kanban` é append-only: uma linha por transição. Aqui
-- isso seria pior. As perguntas desta tela são "quanto tempo ficou parada?" e
-- "está parada AGORA?", e com dois eventos soltos as duas exigem parear
-- linhas — um pareamento que falha em silêncio justamente no caso que mais
-- importa, a parada que ninguém fechou. Como INTERVALO, essa parada fica
-- escancarada: `encerrada_em IS NULL` há três dias.
--
-- ⚠️ A PARADA ABERTA É CONSEQUÊNCIA DO STATUS, NUNCA UM REGISTRO PARALELO.
-- Quem abre e fecha é `trocarStatusAction`, funil único: entrou em status que
-- impede, abre; voltou pra apto, fecha. Se a tela deixasse abrir uma parada
-- por um caminho e mudar o status por outro, a máquina apareceria "Livre" com
-- uma parada aberta correndo há dias — o histórico e o rótulo do cartão
-- contando histórias diferentes sobre o mesmo minuto.
--
-- Idempotente. Só aditivo: nada de DROP TABLE, DELETE, TRUNCATE ou UPDATE.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.maquina_paradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maquina_id uuid NOT NULL
    REFERENCES public.maquinas (id) ON DELETE CASCADE,

  -- QUAL IMPEDIMENTO CAUSOU A PARADA. É `maquina_status` e não texto livre
  -- porque é exatamente o valor que foi gravado na máquina — e o CHECK abaixo
  -- garante que só os três que IMPEDEM produzir cheguem aqui
  -- (src/lib/producao/estado-maquina.ts é quem define quais são).
  status public.maquina_status NOT NULL,

  -- O MOTIVO ESCOLHIDO NA LISTA. Nulo de propósito: `setup` e `desativada`
  -- são marcados no formulário de cadastro, sem diálogo de motivo. Quem
  -- escolhe motivo é o botão Manutenção do cartão, que é o caso do dia a dia.
  --
  -- ⚠️ TEXTO COM CHECK, E NÃO UM ENUM NOVO. A lista é da fábrica e vai mudar
  -- (um dia vão querer separar elétrica de mecânica). Valor de enum do
  -- Postgres não se remove; um CHECK se reescreve em duas linhas, do mesmo
  -- jeito idempotente que está aqui embaixo.
  motivo text,

  -- Só pra "Outro": dizer o quê. O CHECK abaixo exige.
  observacao_abertura text,

  -- ⚠️ UMA COLUNA DE DATA, não duas. A tentação é ter `created_at` (quando a
  -- linha foi gravada) além de `iniciada_em` (quando a máquina parou), mas
  -- nenhuma tela permite registrar parada com hora de trás — seriam dois
  -- campos pra mesma verdade, que é como eles saem de sincronia. Se um dia
  -- existir "parou às 8h, registrei às 9h", aí a segunda entra com motivo.
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  aberta_por uuid REFERENCES public.users (id),

  -- Nulo = a máquina AINDA está parada. Não existe booleano `encerrada`
  -- separado: dois campos pra mesma verdade saem de sincronia (o mesmo
  -- raciocínio de `recebido_em` em 55_pedido_parcelas.sql).
  encerrada_em timestamptz,
  encerrada_por uuid REFERENCES public.users (id),
  observacao_fechamento text,

  -- SNAPSHOT do que estava em produção quando a máquina parou. Sem ON DELETE
  -- CASCADE: apagar a OP não pode apagar a parada — a máquina parou de
  -- verdade, e "o que estava rodando" é pergunta com uma resposta só,
  -- congelada no instante. A OP pode ser concluída ou movida depois; nada
  -- disso muda o que estava lá.
  ordem_id uuid REFERENCES public.ordens_producao (id)
);

-- ------------------------------------------------------------
-- As regras que o banco não deixa quebrar
-- ------------------------------------------------------------
-- DROP+ADD em todas pra manter o arquivo idempotente — mesmo idioma de
-- `orcamento_parcelas_recebimento_ck` (55) e `tarefas_conclusao_ck` (35).

-- Só entra aqui o que É parada. Máquina 'operando' com linha nesta tabela
-- seria uma parada que nunca aconteceu contando tempo no relatório.
ALTER TABLE public.maquina_paradas
  DROP CONSTRAINT IF EXISTS maquina_paradas_status_ck;
ALTER TABLE public.maquina_paradas
  ADD CONSTRAINT maquina_paradas_status_ck
  CHECK (status IN ('manutencao','setup','desativada'));

-- A lista de motivos da fábrica.
ALTER TABLE public.maquina_paradas
  DROP CONSTRAINT IF EXISTS maquina_paradas_motivo_ck;
ALTER TABLE public.maquina_paradas
  ADD CONSTRAINT maquina_paradas_motivo_ck
  CHECK (motivo IS NULL OR motivo IN (
    'quebra',
    'preventiva',
    'troca_agulha',
    'falta_fio',
    'sem_operador',
    'energia',
    'outro'
  ));

-- "Outro" sem dizer o quê é a linha que ninguém consegue interpretar seis
-- meses depois — e é justamente a que mais vai aparecer, porque é o escape.
ALTER TABLE public.maquina_paradas
  DROP CONSTRAINT IF EXISTS maquina_paradas_outro_ck;
ALTER TABLE public.maquina_paradas
  ADD CONSTRAINT maquina_paradas_outro_ck
  CHECK (motivo IS DISTINCT FROM 'outro' OR observacao_abertura IS NOT NULL);

-- Encerrada sem autor (ou autor sem data) é estado impossível: as duas
-- colunas andam juntas.
ALTER TABLE public.maquina_paradas
  DROP CONSTRAINT IF EXISTS maquina_paradas_fechamento_ck;
ALTER TABLE public.maquina_paradas
  ADD CONSTRAINT maquina_paradas_fechamento_ck
  CHECK ((encerrada_em IS NULL) = (encerrada_por IS NULL));

-- Parada que termina antes de começar daria duração negativa, e duração
-- negativa some dentro de uma soma sem levantar erro nenhum.
ALTER TABLE public.maquina_paradas
  DROP CONSTRAINT IF EXISTS maquina_paradas_intervalo_ck;
ALTER TABLE public.maquina_paradas
  ADD CONSTRAINT maquina_paradas_intervalo_ck
  CHECK (encerrada_em IS NULL OR encerrada_em >= iniciada_em);

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------

-- ⚠️ NO MÁXIMO UMA PARADA ABERTA POR MÁQUINA. Mesmo desenho de
-- `ordens_producao_maquina_em_producao_uidx` (50), e pelo mesmo motivo: duas
-- linhas abertas na mesma máquina fariam o tempo parado contar EM DOBRO, e o
-- fechamento fecharia uma delas ao acaso, deixando a outra correndo pra
-- sempre. Índice, e não checagem na action: dois toques simultâneos em dois
-- tablets passam por qualquer verificação feita antes do INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS maquina_paradas_aberta_uidx
  ON public.maquina_paradas (maquina_id)
  WHERE encerrada_em IS NULL;

-- A CONSULTA DO HISTÓRICO: as paradas de UMA máquina, da mais recente pra
-- mais antiga. `maquina_id` é o prefixo à esquerda, então este índice serve
-- tanto o filtro quanto a ordenação.
CREATE INDEX IF NOT EXISTS maquina_paradas_maquina_idx
  ON public.maquina_paradas (maquina_id, iniciada_em DESC);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
-- Segue `eventos_kanban` (04_rls.sql), que é a tabela de histórico da casa:
-- todo mundo LÊ, quem escreve se assina, e NINGUÉM APAGA — a ausência de
-- policy de DELETE é o que torna o histórico histórico.
--
-- ⚠️ A ESCRITA SEGUE A ESTAÇÃO, igual à policy de `maquinas`
-- (56_maquinas_rls_estacao.sql): o operador registra parada nas máquinas da
-- estação DELE. Nada de `USING (true)` — parada é o insumo do relatório de
-- disponibilidade, e um tablet esquecido logado não deveria abrir parada numa
-- máquina do outro lado do galpão.
ALTER TABLE public.maquina_paradas ENABLE ROW LEVEL SECURITY;

-- Quem pode escrever parada desta máquina: gerência, ou o operador da estação
-- dela. Em função pra não repetir o mesmo EXISTS em duas policies e elas
-- divergirem uma da outra com o tempo.
CREATE OR REPLACE FUNCTION public.pode_registrar_parada(p_maquina_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_manager()
    OR (
      public.user_role() = 'operador'
      AND EXISTS (
        SELECT 1
        FROM public.maquinas m
        JOIN public.estacao_operadores eo ON eo.estacao_id = m.estacao_id
        WHERE m.id = p_maquina_id
          AND eo.operador_id = auth.uid()
      )
    );
$$;

DROP POLICY IF EXISTS maquina_paradas_select ON public.maquina_paradas;
CREATE POLICY maquina_paradas_select ON public.maquina_paradas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS maquina_paradas_insert ON public.maquina_paradas;
CREATE POLICY maquina_paradas_insert ON public.maquina_paradas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.pode_registrar_parada(maquina_id)
    AND (aberta_por IS NULL OR aberta_por = auth.uid())
  );

-- ⚠️ O ÚNICO UPDATE PERMITIDO É FECHAR. O `USING (encerrada_em IS NULL)`
-- deixa alcançável só a parada aberta, e o `WITH CHECK` exige que a linha
-- SAIA fechada e assinada por quem fechou. Ou seja: parada encerrada vira
-- IMUTÁVEL no banco — ninguém reescreve o motivo de ontem nem se apaga da
-- autoria depois que o relatório já contou aquela hora.
DROP POLICY IF EXISTS maquina_paradas_update_fechar ON public.maquina_paradas;
CREATE POLICY maquina_paradas_update_fechar ON public.maquina_paradas
  FOR UPDATE TO authenticated
  USING (
    encerrada_em IS NULL
    AND public.pode_registrar_parada(maquina_id)
  )
  WITH CHECK (
    encerrada_em IS NOT NULL
    AND encerrada_por = auth.uid()
  );

-- ------------------------------------------------------------
-- REALTIME: de propósito, NÃO.
-- ------------------------------------------------------------
-- Toda parada nasce e morre junto com uma troca de `maquinas.status`, e
-- `maquinas` já está na publicação (05_realtime.sql). Publicar esta tabela
-- também faria cada parada disparar DOIS refreshes na aba Máquinas pelo mesmo
-- acontecimento.

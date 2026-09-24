import 'server-only'

import { sql } from 'drizzle-orm'

// O PRODUTO TEM UM TAMANHO SÓ? — a pergunta que `linhaDaOp`
// (src/lib/producao/rotulo-da-op.ts) precisa pra não escrever "45X45" em toda
// capa de almofada.
//
// Morava dentro de producao/actions.ts, onde o tablet e o kanban usam. Saiu de
// lá quando /ordens passou a desenhar a MESMA linha do Trello: duas cópias da
// subconsulta deixariam a lista do gerente e o tablet discordando sobre o
// tamanho aparecer ou não.
//
// ⚠️ TAMANHO ÚNICO SAI DAS VARIAÇÕES VIVAS, na própria consulta — uma
// subconsulta correlacionada por linha, e não uma ida ao banco por produto: é
// a tela que mais recarrega do sistema, em três tablets. Nunca adivinhado pelo
// nome. `"produtos"."id"` qualificado à mão pelo mesmo motivo das
// subconsultas de `produzido`: sem isso, o `id` resolveria pra
// `variacoes_produto` e a conta daria errado em silêncio.
//
// Com o produto em LEFT JOIN (cartão de máquina livre), a conta dá 0 e o
// valor não é usado — não há OP pra montar linha.
export const tamanhoUnicoSql = sql<boolean>`(
  SELECT count(DISTINCT lower(trim(v_tam.tamanho)))
    FROM variacoes_produto v_tam
   WHERE v_tam.produto_id = "produtos"."id"
     AND v_tam.deleted_at IS NULL
) <= 1`

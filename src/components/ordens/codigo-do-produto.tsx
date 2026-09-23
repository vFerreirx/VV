/**
 * O CÓDIGO DO PROGRAMA ANTES DO NOME, nas telas do gerente — kanban (cartão e
 * pasta de produto), /ordens e a ficha da OP.
 *
 * É o mesmo número que o operador lê primeiro no tablet ("059 - Peseira -
 * LINKS…", `linhaDaOp`), só que MENOR: aqui ele acompanha o nome, lá ele
 * abre a linha. Gerente e operador falando do mesmo número é o que evita o
 * "qual peseira?" no corredor.
 *
 * Sem código (produto novo, ou de parceiro), não desenha nada — nem um traço.
 */
export function CodigoDoProduto({ codigo }: { codigo: string | null }) {
  const c = codigo?.trim()
  if (!c) return null
  return (
    <span className="text-foreground mr-1 font-semibold tabular-nums">{c}</span>
  )
}

// O NOME DA MÁQUINA — regra pura, sem banco e sem React.
//
// Ninguém na fábrica fala "TC". A máquina é "Máquina 4" em todo lugar —
// tablet, quadro, Ordens, avisos, histórico novo, Fábrica, Estações, "Este
// aparelho" —, e o nome sai SEMPRE daqui, a partir de `maquinas.numero`
// (supabase/sql/74_numero_da_maquina.sql). Não existe campo de nome livre.
//
// ⚠️ NUNCA MOSTRE `maquinas.codigo` NEM `maquinas.nome`. Os dois são legado:
// o `codigo` era o "TC-04" (máquina nova grava o próprio uuid ali), e o
// `nome` é só espelho deste nome. O histórico JÁ GRAVADO continua citando
// "TC-03" — é texto de quando foi escrito, e não se reescreve.
//
// A ORDEM É NUMÉRICA: 1, 2, 3 … 10, 11. No SQL, `orderBy(asc(maquinas.numero))`;
// em memória, `compararMaquinas`. Ordenar pelo nome montado poria a 10 antes
// da 2.

/** "Máquina 4", sem zero à esquerda. */
export function nomeDaMaquina(numero: number): string {
  return `Máquina ${numero}`
}

/**
 * Várias máquinas numa frase: "Máquinas 1, 2, 3 e 7". Em ordem numérica e
 * sem repetir; com uma só, "Máquina 4"; com nenhuma, texto vazio.
 *
 * Pra frase corrida (a lista de uma estação, a faixa de máquinas sem estação).
 * Onde cada máquina é um item — o cartão, o chip, a linha —, é
 * `nomeDaMaquina` em cada um.
 */
export function nomesDasMaquinas(numeros: readonly number[]): string {
  const unicos = [...new Set(numeros)].sort((a, b) => a - b)
  if (unicos.length === 0) return ''
  if (unicos.length === 1) return nomeDaMaquina(unicos[0])
  const inicio = unicos.slice(0, -1).join(', ')
  return `Máquinas ${inicio} e ${unicos[unicos.length - 1]}`
}

/** Pra `.sort()` de qualquer lista de máquinas: pelo número. */
export function compararMaquinas(
  a: { numero: number },
  b: { numero: number },
): number {
  return a.numero - b.numero
}

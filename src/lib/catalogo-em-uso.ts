// O USO DE UMA COR / MODELO / TAMANHO, em texto — a parte que não toca o
// banco, e por isso tem teste (src/lib/producao/regras.test.ts).
//
// As consultas moram em src/lib/db/uso-do-catalogo.ts; aqui ficam o formato do
// resultado e as frases que a tela mostra. O porquê da guarda inteira está lá.

export type UsoDoCatalogo = {
  /** Nome do item, pra mensagem. */
  nome: string
  /** Partes do "onde está em uso", já em texto ("8 variações de 6 produtos"). */
  partes: string[]
  get emUso(): boolean
}

export function uso(nome: string, partes: string[]): UsoDoCatalogo {
  return {
    nome,
    partes,
    get emUso() {
      return partes.length > 0
    },
  }
}

export const plural = (n: number, um: string, muitos: string) =>
  `${n} ${n === 1 ? um : muitos}`

/**
 * A frase que a action devolve. Diz ONDE está em uso — quem vai decidir o que
 * fazer precisa saber o que vai quebrar — e oferece a saída.
 */
export function erroDeUso(u: UsoDoCatalogo, rotulo: string): string {
  return (
    `"${u.nome}" está em uso: ${u.partes.join(', ')}. ` +
    `Desative ${rotulo} em vez de excluir — assim ele sai dos formulários ` +
    `sem sumir de quem já usa.`
  )
}

/**
 * A mensagem de um lote: quantos saíram e quais ficaram, com o porquê do
 * primeiro bloqueado.
 *
 * Exclusão em lote NÃO é tudo-ou-nada aqui: apagar os livres e dizer quais
 * não deu é mais útil que recusar dez por causa de um — e nenhum dos dois
 * apaga escondido, que é o que interessa.
 */
export function mensagemDoLote(
  excluidos: number,
  bloqueados: UsoDoCatalogo[],
  rotulo: { um: string; muitos: string },
): string {
  const saiu =
    excluidos === 0
      ? 'Nenhum excluído'
      : `${plural(excluidos, rotulo.um, rotulo.muitos)} excluído(s)`
  if (bloqueados.length === 0) return saiu
  const nomes = bloqueados.map((b) => `"${b.nome}"`).join(', ')
  const primeiro = bloqueados[0]!
  return (
    `${saiu}. ${nomes} ficaram porque estão em uso ` +
    `(${primeiro.nome}: ${primeiro.partes.join(', ')}). Desative em vez de excluir.`
  )
}

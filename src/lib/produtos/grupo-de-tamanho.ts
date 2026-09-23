// GRUPO DE TAMANHO: os tamanhos de casa (Casal, King, 45x45, Manta…) e os de
// roupa (PP, P, M, G, GG, G1) moram no MESMO cadastro. Sem o grupo, o gerador
// de variações oferecia os 14 pra todo produto — PP numa peseira, King num
// suéter.
//
// O produto diz de qual grupo é (`produtos.grupo_tamanho`), e a tela dele só
// oferece os tamanhos desse grupo.
//
// ⚠️ MAIS OS QUE ELE JÁ USA. Um produto antigo pode ter variação num tamanho
// de outro grupo (cadastrada antes do grupo existir, ou o grupo do tamanho foi
// trocado depois). Esconder esse tamanho faria o seletor da variação abrir
// VAZIO — e salvar apagaria o valor que estava lá. Filtrar o que se oferece é
// uma coisa; esconder o que já existe é outra, e essa não pode.
//
// ⚠️ A TUPLA TEM CÓPIA NO BANCO: os CHECKs da
// supabase/sql/72_origem_e_grupo_de_tamanho.sql.
//
// Lógica pura, sem banco: testada em src/lib/producao/regras.test.ts.

export const GRUPOS_DE_TAMANHO = ['casa', 'vestuario'] as const
export type GrupoDeTamanho = (typeof GRUPOS_DE_TAMANHO)[number]

export const ROTULO_DO_GRUPO: Record<GrupoDeTamanho, string> = {
  casa: 'Casa',
  vestuario: 'Vestuário',
}

export function ehGrupoValido(v: unknown): v is GrupoDeTamanho {
  return (
    typeof v === 'string' && (GRUPOS_DE_TAMANHO as readonly string[]).includes(v)
  )
}

// A variação guarda o tamanho como TEXTO livre: compara sem caixa e sem
// espaço nas pontas, como o resto do catálogo (uso-do-catalogo.ts, preco.ts).
const norm = (s: string) => s.trim().toLowerCase()

/**
 * Os tamanhos que o produto oferece: os do grupo dele, mais qualquer um que
 * ele já usa. Mantém a ordem de entrada (a `ordem` do cadastro).
 */
export function tamanhosDoGrupo<T extends { nome: string; grupo: string }>(
  tamanhos: readonly T[],
  grupo: string,
  jaUsados: Iterable<string | null | undefined>,
): T[] {
  const usados = new Set<string>()
  for (const u of jaUsados) if (u && u.trim()) usados.add(norm(u))
  return tamanhos.filter((t) => t.grupo === grupo || usados.has(norm(t.nome)))
}

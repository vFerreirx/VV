// Quando um item da lixeira é VELHO — e por que isso não vira expurgo.
//
// 90 dias é o corte que separa "excluí semana passada, posso ter errado" de
// "isto está aqui desde antes de ontem importar". Serve pra FILTRAR e pra dar
// contexto antes de apagar de vez.
//
// ⚠️ NÃO EXISTE EXPURGO AUTOMÁTICO, e a ausência é decisão: lixeira que se
// esvazia sozinha deixa de ser lixeira — vira um segundo delete, com data
// marcada e sem ninguém olhando. Quem apaga de vez é o admin, por clique.
//
// Mora aqui, e não em lixeira/actions.ts, porque aquele arquivo é
// `'use server'` e só pode exportar função async.
export const DIAS_LIXEIRA_ANTIGA = 90

export function estaAntigoNaLixeira(dias: number): boolean {
  return dias >= DIAS_LIXEIRA_ANTIGA
}

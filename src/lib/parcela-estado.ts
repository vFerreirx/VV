// EM QUE PÉ ESTÁ UMA PARCELA — regra pura, sem banco e sem React.
//
// Duas telas perguntam isso e precisam da MESMA resposta: o painel do pedido
// (`parcelas-painel.tsx`), que lista as parcelas, e o sino de notificações
// (`notificacoes/actions.ts`), que lembra de conferir se o dinheiro caiu. Se
// cada um decidisse por conta própria, o sino diria "atrasada há 2 dias"
// enquanto a tela do mesmo pedido diria "vence hoje" — e não haveria como
// saber qual dos dois está certo.
//
// Cada superfície escolhe as PALAVRAS (o sino escreve frase de aviso, a tela
// escreve rótulo de linha); o que não pode divergir é a classificação e a
// contagem de dias, e é só isso que mora aqui.
//
// ⚠️ TEXTO 'YYYY-MM-DD' O TEMPO TODO, nunca `Date`. `vencimento` é `date` no
// Postgres — um DIA, sem hora e sem fuso — e este projeto já pagou por
// confundir os dois: o comentário de `estaVencida`
// (src/lib/validators/tarefas.ts) conta como o servidor UTC da Vercel fazia
// a tarefa vencer às 21h da véspera, com o selo do servidor e o vermelho da
// tela se contradizendo na mesma linha. `diasEntre` faz a conta em
// meia-noite UTC dos dois lados e devolve inteiro.

// ⚠️ IMPORT RELATIVO COM EXTENSÃO, e não o `@/lib/...` do resto do projeto:
// este módulo é exercitado pelo runner embutido do Node
// (`node --test --experimental-strip-types`), que não conhece os aliases do
// tsconfig. É a mesma razão pela qual os módulos de src/lib/producao/ se
// importam entre si assim.
import { diasEntre, hojeEmBrasilia } from './dia-brasil.ts'

// DEFAULTS DO GERADOR. Moram aqui, e não no arquivo de actions, por uma
// razão do Next: um módulo `'use server'` só pode exportar FUNÇÕES ASYNC —
// exportar uma constante de lá quebra o build com "Ecmascript file had an
// error". E é o lugar certo de qualquer jeito: são regra do domínio da
// parcela, lidas pelo servidor (que gera) e pela tela (que sugere).
//
// 30 dias é o que boleto de atacado costuma ser; o intervalo idem. Os dois
// são só o ponto de partida do formulário — tudo é editável depois.
export const DIAS_ATE_O_PRIMEIRO = 30
export const INTERVALO_PADRAO_DIAS = 30

export type EstadoDaParcela =
  /** Já recebida — o dinheiro caiu e alguém confirmou. */
  | 'recebida'
  /** Vence hoje: a pergunta "caiu?" passa a existir agora. */
  | 'vence_hoje'
  /** Venceu e ninguém deu baixa. */
  | 'atrasada'
  /** Ainda vai vencer — não há o que conferir. */
  | 'pendente'

export type SituacaoDaParcela = {
  estado: EstadoDaParcela
  /**
   * Dias inteiros de atraso. Só faz sentido em 'atrasada' (sempre ≥ 1); nos
   * demais estados é 0 — inclusive em 'vence_hoje', que é atraso zero e não
   * atraso de um dia.
   */
  diasAtraso: number
  /**
   * O sino deve mostrar esta parcela? É `vence_hoje` OU `atrasada`.
   *
   * ⚠️ NÃO INCLUI 'pendente' de propósito. O lembrete é "confira se caiu", e
   * essa pergunta não existe antes da data — avisar na véspera encheria o
   * sino de coisas sobre as quais não há nada a fazer, e um sino que sempre
   * tem algo aceso deixa de ser lido.
   */
  cobravel: boolean
}

export function situacaoDaParcela(
  vencimento: string,
  recebidoEm: Date | string | null,
  hoje: string = hojeEmBrasilia(),
): SituacaoDaParcela {
  // RECEBIDA VENCE TUDO, e nesta ordem: uma parcela paga com atraso não é
  // "atrasada" — é resolvida. O que importa depois da baixa é o histórico,
  // não a cobrança.
  if (recebidoEm != null) {
    return { estado: 'recebida', diasAtraso: 0, cobravel: false }
  }

  // Negativo = o vencimento já passou.
  const dias = diasEntre(hoje, vencimento)
  if (dias > 0) return { estado: 'pendente', diasAtraso: 0, cobravel: false }
  if (dias === 0) {
    return { estado: 'vence_hoje', diasAtraso: 0, cobravel: true }
  }
  return { estado: 'atrasada', diasAtraso: -dias, cobravel: true }
}

/**
 * "vence hoje" / "atrasada há 3 dias" / "vence em 5 dias" — o rótulo curto
 * do painel. A tela de notificação monta frase própria a partir da
 * `situacaoDaParcela`, porque lá o sujeito é o pedido, não a parcela.
 */
export function rotuloDaSituacao(s: SituacaoDaParcela): string {
  switch (s.estado) {
    case 'recebida':
      return 'recebida'
    case 'vence_hoje':
      return 'vence hoje'
    case 'atrasada':
      return s.diasAtraso === 1
        ? 'atrasada há 1 dia'
        : `atrasada há ${s.diasAtraso} dias`
    case 'pendente':
      return 'pendente'
  }
}

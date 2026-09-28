// O placar: cada checagem vira uma linha na saída, e qualquer falha vira
// código de saída ≠ 0.

/** Lançado por `exigir`: o cenário não tem como seguir. */
export class PassoFalhou extends Error {}

export class Placar {
  ok = 0
  falhas = 0
  pulos = 0

  titulo(texto: string) {
    console.log(`\n${texto}`)
  }

  checar(nome: string, passou: boolean, detalhe?: unknown): boolean {
    if (passou) {
      this.ok++
      console.log(`  ✓ ${nome}`)
    } else {
      this.falhas++
      const extra = detalhe === undefined ? '' : ` — ${formatar(detalhe)}`
      console.log(`  ✗ ${nome}${extra}`)
    }
    return passou
  }

  /** Igual a `checar`, mas para o cenário quando falha. */
  exigir(nome: string, passou: boolean, detalhe?: unknown): void {
    if (!this.checar(nome, passou, detalhe)) throw new PassoFalhou(nome)
  }

  /** Falta dado pra este passo: não é falha, mas fica dito o porquê. */
  pular(nome: string, porque: string) {
    this.pulos++
    console.log(`  – pulado: ${nome} (${porque})`)
  }

  falhar(nome: string, detalhe: unknown) {
    this.checar(nome, false, detalhe)
  }

  resumo(): string {
    return `${this.ok} certas, ${this.falhas} falhas, ${this.pulos} puladas`
  }
}

function formatar(v: unknown): string {
  if (typeof v === 'string') return v
  if (v instanceof Error) return v.stack ?? v.message
  return JSON.stringify(v)
}

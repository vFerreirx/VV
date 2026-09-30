// A MÁQUINA É UM NÚMERO (supabase/sql/74_numero_da_maquina.sql), pelo
// cadastro de verdade.
//
// O formulário pede só "Número"; o nome sai de `nomeDaMaquina`. O número é
// único ENTRE AS VIVAS (índice parcial), a máquina nova grava o próprio uuid
// no `codigo` legado, e mudar o número de uma que já existe pode.
//
// Tudo com o gerente, dentro da transação desfeita: as máquinas criadas aqui
// nunca existiram fora dela.

import { and, eq, isNull, sql } from 'drizzle-orm'

import { maquinas } from '@/lib/db/schema'
import { nomeDaMaquina } from '@/lib/producao/nome-da-maquina'

import type { Cenario } from '../lib/contexto'

export const cadastroDeMaquina: Cenario = {
  nome: 'cadastro-de-maquina',
  rodar: async (ctx) => {
    const { elenco, placar: p, tx } = ctx
    const { maquinas: cadastro } = ctx.acoes

    if (elenco.gerente.valor === null) {
      p.pular('o roteiro inteiro (falta gerente)', elenco.gerente.porque)
      return
    }
    ctx.como(elenco.gerente.valor)

    const [{ maior }] = await tx
      .select({ maior: sql<number>`max(${maquinas.numero})::int` })
      .from(maquinas)
      .where(isNull(maquinas.deletedAt))
    const [existente] = await tx
      .select({ numero: maquinas.numero })
      .from(maquinas)
      .where(isNull(maquinas.deletedAt))
      .limit(1)
    const livre = (maior ?? 0) + 1
    console.log(
      `  existente ${nomeDaMaquina(existente.numero)} · livre ${nomeDaMaquina(livre)}`,
    )

    // ---------------------------------------------- número repetido
    let r = await cadastro.criarMaquinaAction({
      numero: existente.numero,
      status: 'operando',
    })
    p.checar(
      `número repetido: "Já existe a ${nomeDaMaquina(existente.numero)}"`,
      !r.success && r.error === `Já existe a ${nomeDaMaquina(existente.numero)}`,
      r,
    )

    // ------------------------------------------------ máquina nova
    r = await cadastro.criarMaquinaAction({ numero: livre, status: 'operando' })
    p.exigir(`cria a ${nomeDaMaquina(livre)}`, r.success, r)
    const id = r.success ? r.data!.id : ''
    const [nova] = await tx
      .select({ numero: maquinas.numero, codigo: maquinas.codigo, nome: maquinas.nome })
      .from(maquinas)
      .where(eq(maquinas.id, id))
    p.checar(
      '  `codigo` legado = o próprio uuid, `nome` = o nome montado',
      nova.numero === livre && nova.codigo === id && nova.nome === nomeDaMaquina(livre),
      nova,
    )
    const naTela = await cadastro.obterMaquina(id)
    p.checar(
      '  a tela recebe o número, e não o `codigo` nem o `nome`',
      naTela !== null && naTela.numero === livre && !('codigo' in naTela) && !('nome' in naTela),
      naTela && Object.keys(naTela),
    )

    // ------------------------------------------------ mudar o número
    r = await cadastro.atualizarMaquinaAction(id, {
      numero: existente.numero,
      status: 'operando',
    })
    p.checar(
      'mudar pra um número ocupado: recusa com o mesmo texto',
      !r.success && r.error === `Já existe a ${nomeDaMaquina(existente.numero)}`,
      r,
    )
    r = await cadastro.atualizarMaquinaAction(id, {
      numero: livre + 1,
      status: 'operando',
    })
    const [mudada] = await tx
      .select({ numero: maquinas.numero, codigo: maquinas.codigo, nome: maquinas.nome })
      .from(maquinas)
      .where(eq(maquinas.id, id))
    p.checar(
      `mudar pra um número livre: vira a ${nomeDaMaquina(livre + 1)}, e o \`codigo\` não muda`,
      r.success &&
        mudada.numero === livre + 1 &&
        mudada.codigo === id &&
        mudada.nome === nomeDaMaquina(livre + 1),
      { r, mudada },
    )

    // -------------------------------- o número da apagada fica livre
    r = await cadastro.excluirMaquinaAction(id)
    p.exigir('exclui a máquina nova', r.success, r)
    r = await cadastro.criarMaquinaAction({ numero: livre + 1, status: 'operando' })
    const vivas = await tx
      .select({ id: maquinas.id })
      .from(maquinas)
      .where(and(eq(maquinas.numero, livre + 1), isNull(maquinas.deletedAt)))
    p.checar(
      `o número da máquina na lixeira está livre: outra ${nomeDaMaquina(livre + 1)} entra`,
      r.success && vivas.length === 1,
      r,
    )

    // ------------------------------------------------ ordem numérica
    const lista = await cadastro.listarMaquinas()
    const numeros = lista.map((m) => m.numero)
    p.checar(
      'a lista de máquinas vem em ordem numérica (a 2 antes da 10)',
      numeros.every((n, i) => i === 0 || numeros[i - 1] < n),
      numeros,
    )
  },
}

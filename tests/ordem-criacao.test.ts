import assert from 'node:assert/strict'
import { test } from 'node:test'
import { criarOrdemSchema, ordemSchema, statusValues } from '../src/lib/validators/ordens'
import { diaEmBrasilia } from '../src/lib/dia-brasil'
import {
  erroDaVariacao,
  modelosDoProduto,
  variacoesDoModelo,
} from '../src/lib/producao/catalogo-op'

const id = '11111111-1111-4111-8111-111111111111'
const entrada = {
  produtoId: id,
  variacaoId: '',
  quantidade: '20',
  maquinaId: '',
  responsavelId: '',
  canalDestino: 'estoque',
  prioridade: 'normal',
  status: 'programado',
  dataPrevistaInicio: '',
  dataPrevistaFim: '',
  observacoes: '',
}

for (const status of statusValues) {
  test('criação: ' + status, () => {
    assert.equal(
      criarOrdemSchema.safeParse({ ...entrada, status }).success,
      status === 'programado' || status === 'aguardando_materia_prima',
    )
  })
}
test('nova OP não pode pular a escolha de máquina e responsável', () => {
  assert.equal(criarOrdemSchema.safeParse({ ...entrada, maquinaId: id }).success, false)
  assert.equal(criarOrdemSchema.safeParse({ ...entrada, responsavelId: id }).success, false)
})
test('valida novamente dados já transformados pelo formulário', () => {
  const primeira = criarOrdemSchema.parse(entrada)
  assert.equal(primeira.quantidade, 20)
  assert.equal(primeira.maquinaId, null)
  assert.deepEqual(criarOrdemSchema.parse(primeira), primeira)
})
test('schema de edição preserva estados históricos', () => {
  assert.equal(ordemSchema.safeParse({ ...entrada, status: 'acabamento' }).success, true)
  assert.equal(ordemSchema.safeParse({ ...entrada, status: 'embalagem' }).success, true)
})
// `corHex` vem com o catálogo desde a busca do "Nova OP" (a amostra de cor).
const semHex = { corHex: null, corHex2: null }
const variacoes = [
  { id: 'a', modelo: 'LINKS', tamanho: '45x45', cor: 'Âmbar', skuVariacao: 'A', ...semHex },
  { id: 'b', modelo: 'LINKS', tamanho: '50x50', cor: 'Rose', skuVariacao: 'B', ...semHex },
  { id: 'c', modelo: 'ARAN', tamanho: '45x45', cor: 'Rose', skuVariacao: 'C', ...semHex },
]
test('catálogo oferece todos os modelos e separa suas variações', () => {
  assert.deepEqual(modelosDoProduto({ variacoes }), ['LINKS', 'ARAN'])
  const links = variacoesDoModelo(variacoes, 'LINKS')
  assert.deepEqual(
    links.map((v) => v.id),
    ['a', 'b'],
  )
  assert.deepEqual(
    links.filter((v) => v.tamanho === '45x45').map((v) => v.cor),
    ['Âmbar'],
  )
})
test('produto sem modelo continua acessível', () => {
  assert.deepEqual(modelosDoProduto({ variacoes: [] }), ['Sem modelo'])
  const sem = [{ ...variacoes[0], modelo: null }]
  assert.deepEqual(variacoesDoModelo(sem, 'Sem modelo'), sem)
})
test('exige uma variação existente do produto selecionado', () => {
  assert.equal(erroDaVariacao('a', variacoes), null)
  assert.ok(erroDaVariacao('', variacoes))
  assert.ok(erroDaVariacao('de-outro-produto', variacoes))
  assert.ok(erroDaVariacao('removida', []))
  // Variação é sempre obrigatória, mesmo em produto sem variação.
  assert.ok(erroDaVariacao('', []))
})

test('catálogo renderiza uma única cor selecionada e preserva a variação da edição', async () => {
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { CatalogoOrdem } = await import('../src/components/forms/catalogo-ordem')
  const html = renderToStaticMarkup(
    createElement(CatalogoOrdem, {
      produtos: [{ id, sku: '059', nome: 'Capa', origem: 'producao', variacoes }],
      produtoId: id,
      variacaoId: 'a',
      disabled: false,
      onChange: () => {},
    }),
  )
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1)
  assert.match(html, /Âmbar/)
  assert.doesNotMatch(html, /Rose/)
})

test('variação sem modelo não assume outro modelo do mesmo produto na edição', async () => {
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { CatalogoOrdem } = await import('../src/components/forms/catalogo-ordem')
  const html = renderToStaticMarkup(
    createElement(CatalogoOrdem, {
      produtos: [
        {
          id,
          sku: '059',
          nome: 'Capa',
          origem: 'producao',
          variacoes: [...variacoes, { ...variacoes[0], id: 'sem', modelo: null, cor: 'Azul' }],
        },
      ],
      produtoId: id,
      variacaoId: 'sem',
      disabled: false,
      onChange: () => {},
    }),
  )
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1)
  assert.match(html, /Sem modelo/)
  assert.match(html, /Azul/)
})

// O PRAZO DIGITADO, IDA E VOLTA — pelo schema de verdade, o mesmo do form
// (zodResolver) e da Server Action. Era gravado à meia-noite UTC: "30/09"
// virava 29/09 às 21h em Brasília.
test('prazo digitado 30/09: grava o fim do dia em Brasília e volta como 30/09', () => {
  const r = ordemSchema.safeParse({
    ...entrada,
    dataPrevistaInicio: '2026-09-28',
    dataPrevistaFim: '2026-09-30',
  })
  assert.ok(r.success)
  const fim = r.data.dataPrevistaFim as Date
  const inicio = r.data.dataPrevistaInicio as Date
  // O que vai pro banco: 30/09 23:59:59 em Brasília; o início, 28/09 00:00.
  assert.equal(fim.toISOString(), '2026-10-01T02:59:59.000Z')
  assert.equal(inicio.toISOString(), '2026-09-28T03:00:00.000Z')

  // Abrir o editar: o campo mostra o dia de BRASÍLIA do que está gravado
  // (`dateToInput` em ordem-form.tsx chama `diaEmBrasilia`).
  assert.equal(diaEmBrasilia(fim), '2026-09-30')
  assert.equal(diaEmBrasilia(inicio), '2026-09-28')

  // Salvar de novo sem mexer: o campo manda "2026-09-30" outra vez, e o
  // instante é o MESMO — a edição não empurra o prazo pra frente.
  const deNovo = ordemSchema.safeParse({
    ...entrada,
    dataPrevistaInicio: diaEmBrasilia(inicio),
    dataPrevistaFim: diaEmBrasilia(fim),
  })
  assert.ok(deNovo.success)
  assert.equal((deNovo.data.dataPrevistaFim as Date).getTime(), fim.getTime())
  assert.equal((deNovo.data.dataPrevistaInicio as Date).getTime(), inicio.getTime())

  // A Server Action re-valida o Date que o form já transformou: passa direto.
  const naAction = ordemSchema.safeParse({ ...entrada, dataPrevistaFim: fim })
  assert.ok(naAction.success)
  assert.equal((naAction.data.dataPrevistaFim as Date).getTime(), fim.getTime())

  // E a Nova OP (criarOrdemSchema) grava o mesmo instante.
  const criada = criarOrdemSchema.safeParse({ ...entrada, dataPrevistaFim: '2026-09-30' })
  assert.ok(criada.success)
  assert.equal((criada.data.dataPrevistaFim as Date).toISOString(), '2026-10-01T02:59:59.000Z')
})

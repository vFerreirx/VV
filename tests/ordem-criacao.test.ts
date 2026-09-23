import assert from 'node:assert/strict'
import { test } from 'node:test'
import { criarOrdemSchema, ordemSchema, statusValues } from '../src/lib/validators/ordens'
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

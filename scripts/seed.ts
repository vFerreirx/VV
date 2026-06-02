/**
 * Seed do banco com dados de demonstração.
 *
 * Cria:
 *   - 5 usuários (1 por role) via Supabase Admin API
 *     → trigger handle_new_user popula public.users
 *   - 18 máquinas M-01..M-18 com status variados
 *   - 10 produtos com 2-3 variações cada
 *   - 20 OPs distribuídas pelos estados do kanban (numero via trigger)
 *   - apontamentos para OPs em produção
 *   - movimentações de estoque (saída) para OPs prontas/enviadas
 *
 * Uso: npm run db:seed
 *
 * Idempotente: limpa todas as tabelas (e os auth.users seedados) antes
 * de inserir. Não toca em usuários reais que tenham sido criados fora.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '../src/lib/db/schema'

loadEnv({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    '❌ DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar em .env.local',
  )
  process.exit(1)
}

const client = postgres(DATABASE_URL, { max: 1, prepare: false })
const db = drizzle(client, { schema, casing: 'snake_case' })

const supaAdmin = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// -----------------------------------------------------------------
// Dados base
// -----------------------------------------------------------------

type SeedUser = {
  username: string
  senha: string
  nome: string
  telefone: string
  role: schema.User['role']
}

const SEED_USERS: SeedUser[] = [
  {
    username: 'admin',
    senha: 'Senha123!',
    nome: 'Admin Demo',
    telefone: '+5511999990001',
    role: 'admin',
  },
  {
    username: 'gerente',
    senha: 'Senha123!',
    nome: 'Gerente de Produção',
    telefone: '+5511999990002',
    role: 'gerente_producao',
  },
  {
    username: 'operador',
    senha: 'Senha123!',
    nome: 'Operador de Tear',
    telefone: '+5511999990003',
    role: 'operador',
  },
  {
    username: 'estoquista',
    senha: 'Senha123!',
    nome: 'Estoquista',
    telefone: '+5511999990004',
    role: 'estoquista',
  },
  {
    username: 'vendas',
    senha: 'Senha123!',
    nome: 'Vendas Online',
    telefone: '+5511999990005',
    role: 'vendas',
  },
]

// Domínio interno usado pelo Supabase Auth (não é exibido pro usuário).
const INTERNAL_DOMAIN = 'malharia.app'
const internalEmail = (u: string) => `${u}@${INTERNAL_DOMAIN}`

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

// Lista todos os auth.users com paginação e devolve os que têm e-mail
// dentro de uma lista alvo (pra resetar idempotentemente).
async function findAuthUsersByEmail(emails: string[]): Promise<string[]> {
  const targets = new Set(emails.map((e) => e.toLowerCase()))
  const ids: string[] = []
  let page = 1
  // Supabase paginação default é 50, máximo 1000.
  while (true) {
    const { data, error } = await supaAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    })
    if (error) throw error
    for (const u of data.users) {
      if (u.email && targets.has(u.email.toLowerCase())) {
        ids.push(u.id)
      }
    }
    if (data.users.length < 1000) break
    page += 1
  }
  return ids
}

// -----------------------------------------------------------------
// Reset idempotente
// -----------------------------------------------------------------

async function reset() {
  console.log('▶ Limpando dados antigos…')

  // TRUNCATE com CASCADE limpa todas as tabelas de domínio em uma tacada
  // sem se preocupar com ordem de FKs. (Não toca em auth.users — esses
  // sao removidos pelo Admin API abaixo.)
  await client.unsafe(`
    TRUNCATE TABLE
      public.eventos_kanban,
      public.apontamentos_producao,
      public.movimentacoes_estoque,
      public.ordens_producao,
      public.variacoes_produto,
      public.produtos,
      public.cores,
      public.modelos,
      public.tamanhos,
      public.maquinas,
      public.users,
      public.op_numero_counter
    RESTART IDENTITY CASCADE
  `)

  // Remove auth.users seedados anteriormente (com base no email interno).
  const emailsAlvo = SEED_USERS.map((u) => internalEmail(u.username))
  const oldIds = await findAuthUsersByEmail(emailsAlvo)
  for (const id of oldIds) {
    const { error } = await supaAdmin.auth.admin.deleteUser(id)
    if (error) throw error
  }
  if (oldIds.length > 0) {
    console.log(`  • removidos ${oldIds.length} auth.users antigos`)
  }
}

// -----------------------------------------------------------------
// Usuários
// -----------------------------------------------------------------

async function seedUsuarios() {
  console.log('▶ Criando usuários…')
  const idsByRole = new Map<schema.User['role'], string>()

  for (const u of SEED_USERS) {
    const { data, error } = await supaAdmin.auth.admin.createUser({
      email: internalEmail(u.username),
      password: u.senha,
      email_confirm: true,
      user_metadata: {
        username: u.username,
        nome: u.nome,
        telefone: u.telefone,
        role: u.role,
      },
    })
    if (error)
      throw new Error(`Falha ao criar ${u.username}: ${error.message}`)
    if (!data.user) throw new Error(`Sem dados pra ${u.username}`)

    idsByRole.set(u.role, data.user.id)
    console.log(`  • ${u.role.padEnd(18)} ${u.username}`)
  }

  // O trigger handle_new_user já populou public.users, mas é assíncrono
  // em alguns cenários. Aguardamos até todos aparecerem.
  const ids = Array.from(idsByRole.values())
  for (let i = 0; i < 10; i++) {
    const rows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(inArray(schema.users.id, ids))
    if (rows.length === ids.length) break
    await new Promise((r) => setTimeout(r, 250))
  }

  return idsByRole
}

// -----------------------------------------------------------------
// Máquinas (TC-01..TC-18)
// -----------------------------------------------------------------

const STATUSES_INICIAIS = ['operando', 'parada', 'manutencao', 'setup'] as const

async function seedMaquinas(operadorId: string) {
  console.log('▶ Criando 18 máquinas (M-01..M-18)…')
  const rows: schema.NewMaquina[] = []
  for (let i = 1; i <= 18; i++) {
    const codigo = `M-${String(i).padStart(2, '0')}`

    rows.push({
      codigo,
      nome: `Máquina ${codigo}`,
      // Distribui status iniciais; 1ª máquina sempre 'operando' pra ter algo no dashboard
      status: i === 1 ? 'operando' : STATUSES_INICIAIS[i % STATUSES_INICIAIS.length]!,
      // Atribui operador às 3 primeiras pra ter dados de RLS / kanban
      operadorAtualId: i <= 3 ? operadorId : null,
    })
  }

  const inserted = await db.insert(schema.maquinas).values(rows).returning()
  return inserted
}

// -----------------------------------------------------------------
// Cores (catálogo)
// -----------------------------------------------------------------

const CORES_BASE: Array<{ nome: string; codigoHex: string }> = [
  { nome: 'Branco', codigoHex: '#ffffff' },
  { nome: 'Preto', codigoHex: '#111111' },
  { nome: 'Cinza', codigoHex: '#9aa3ad' },
  { nome: 'Azul Marinho', codigoHex: '#1f2c5c' },
  { nome: 'Vermelho', codigoHex: '#c0392b' },
  { nome: 'Verde', codigoHex: '#27ae60' },
  { nome: 'Bege', codigoHex: '#d9c2a0' },
  { nome: 'Rosa', codigoHex: '#f06292' },
]

async function seedCores() {
  console.log('▶ Cadastrando cores…')
  await db.insert(schema.cores).values(
    CORES_BASE.map((c) => ({
      nome: c.nome,
      codigoHex: c.codigoHex,
      ativo: true,
    })),
  )
  console.log(`  • ${CORES_BASE.length} cores`)
}

// -----------------------------------------------------------------
// Modelos (catálogo de desenhos/estampas)
// -----------------------------------------------------------------

const MODELOS_BASE: Array<{ nome: string; descricao?: string }> = [
  { nome: 'Liso', descricao: 'Sem estampa' },
  { nome: 'Padrão Floral' },
  { nome: 'Listrado Marinho' },
  { nome: 'Estampa Cubos' },
  { nome: 'Geométrico' },
  { nome: 'Estampa Folhas' },
]

async function seedModelos() {
  console.log('▶ Cadastrando modelos…')
  await db.insert(schema.modelos).values(
    MODELOS_BASE.map((m) => ({
      nome: m.nome,
      descricao: m.descricao ?? null,
      ativo: true,
    })),
  )
  console.log(`  • ${MODELOS_BASE.length} modelos`)
}

// -----------------------------------------------------------------
// Tamanhos (catálogo)
// -----------------------------------------------------------------

const TAMANHOS_BASE: Array<{ nome: string; ordem: number }> = [
  { nome: 'P', ordem: 10 },
  { nome: 'M', ordem: 20 },
  { nome: 'G', ordem: 30 },
  { nome: 'GG', ordem: 40 },
  { nome: 'Solteiro', ordem: 100 },
  { nome: 'Casal', ordem: 110 },
  { nome: 'Queen', ordem: 120 },
  { nome: 'King', ordem: 130 },
]

async function seedTamanhos() {
  console.log('▶ Cadastrando tamanhos…')
  await db.insert(schema.tamanhos).values(
    TAMANHOS_BASE.map((t) => ({
      nome: t.nome,
      ordem: t.ordem,
      ativo: true,
    })),
  )
  console.log(`  • ${TAMANHOS_BASE.length} tamanhos`)
}

// -----------------------------------------------------------------
// Produtos + variações
// -----------------------------------------------------------------

const CORES = CORES_BASE.map((c) => c.nome)
const MODELOS = MODELOS_BASE.map((m) => m.nome)
const TAMANHOS = TAMANHOS_BASE.map((t) => t.nome)

const PRODUTOS_BASE = [
  { sku: 'PES-001', nome: 'Peseira Solteiro', comprimentoCm: '160.00', larguraCm: '50.00' },
  { sku: 'PES-002', nome: 'Peseira Casal', comprimentoCm: '200.00', larguraCm: '50.00' },
  { sku: 'PES-003', nome: 'Peseira Queen', comprimentoCm: '220.00', larguraCm: '60.00' },
  { sku: 'PES-004', nome: 'Peseira King', comprimentoCm: '240.00', larguraCm: '60.00' },
  { sku: 'CAP-001', nome: 'Capa de Almofada 45x45', comprimentoCm: '45.00', larguraCm: '45.00' },
  { sku: 'CAP-002', nome: 'Capa de Almofada 50x50', comprimentoCm: '50.00', larguraCm: '50.00' },
  { sku: 'CAP-003', nome: 'Capa de Almofada 60x60', comprimentoCm: '60.00', larguraCm: '60.00' },
  { sku: 'CAP-004', nome: 'Capa de Almofada Retangular', comprimentoCm: '50.00', larguraCm: '30.00' },
  { sku: 'PES-005', nome: 'Peseira Super King', comprimentoCm: '260.00', larguraCm: '70.00' },
  { sku: 'CAP-005', nome: 'Capa de Almofada Lombar', comprimentoCm: '55.00', larguraCm: '35.00' },
] as const

async function seedProdutos() {
  console.log('▶ Criando 10 produtos com variações…')
  const insertedProdutos = await db
    .insert(schema.produtos)
    .values(PRODUTOS_BASE.map((p) => ({ ...p })))
    .returning()

  // 2-3 variações por produto (cor + modelo + tamanho aleatório).
  const variacoes: schema.NewVariacaoProduto[] = []
  for (const p of insertedProdutos) {
    const numVar = randomInt(2, 3)
    // Garante que (cor, modelo, tamanho) seja único dentro do produto.
    const usadas = new Set<string>()
    for (let i = 0; i < numVar; i++) {
      let cor = randomChoice(CORES)
      let modelo = randomChoice(MODELOS)
      let tamanho = randomChoice(TAMANHOS)
      let chave = `${cor}|${modelo}|${tamanho}`
      let tentativas = 0
      while (usadas.has(chave) && tentativas < 10) {
        cor = randomChoice(CORES)
        modelo = randomChoice(MODELOS)
        tamanho = randomChoice(TAMANHOS)
        chave = `${cor}|${modelo}|${tamanho}`
        tentativas++
      }
      usadas.add(chave)
      // Nome completo (sem espaços) pra evitar colisões tipo "Verde"/"Vermelho".
      const slug = (s: string) => s.replace(/\s/g, '').toUpperCase()
      variacoes.push({
        produtoId: p.id,
        skuVariacao: `${p.sku}-${slug(cor)}-${slug(modelo)}-${slug(tamanho)}`,
        cor,
        modelo,
        tamanho,
        precoAdicional: '0',
      })
    }
  }

  const insertedVariacoes = await db
    .insert(schema.variacoesProduto)
    .values(variacoes)
    .returning()

  console.log(
    `  • ${insertedProdutos.length} produtos, ${insertedVariacoes.length} variações`,
  )
  return { produtos: insertedProdutos, variacoes: insertedVariacoes }
}

// -----------------------------------------------------------------
// Ordens de produção (estados variados)
// -----------------------------------------------------------------

// Distribuição alvo dos 20 OPs pelos estados (cancelado e aguardando ficam de fora
// do kanban diário mas existem pra exercitar filtros).
const DISTRIBUICAO_STATUS: schema.OrdemProducao['status'][] = [
  'aguardando_materia_prima',
  'aguardando_materia_prima',
  'aguardando_materia_prima',
  'programado',
  'programado',
  'programado',
  'em_producao',
  'em_producao',
  'em_producao',
  'em_producao',
  'acabamento',
  'acabamento',
  'embalagem',
  'embalagem',
  'pronto_envio',
  'pronto_envio',
  'enviado',
  'enviado',
  'enviado',
  'cancelado',
]

const CANAIS = ['full_ml', 'full_shopee', 'venda_direta', 'estoque'] as const
const PRIORIDADES = ['baixa', 'normal', 'normal', 'normal', 'alta', 'urgente'] as const

async function seedOrdens(
  produtos: schema.Produto[],
  variacoes: schema.VariacaoProduto[],
  maquinas: schema.Maquina[],
  idsByRole: Map<schema.User['role'], string>,
) {
  console.log('▶ Criando 20 OPs com estados variados…')
  const gerenteId = idsByRole.get('gerente_producao')!
  const adminId = idsByRole.get('admin')!

  const rows: schema.NewOrdemProducao[] = []

  for (let i = 0; i < DISTRIBUICAO_STATUS.length; i++) {
    const status = DISTRIBUICAO_STATUS[i]!
    const produto = randomChoice(produtos)
    const varDoProduto = variacoes.filter((v) => v.produtoId === produto.id)
    const variacao = varDoProduto.length > 0 ? randomChoice(varDoProduto) : null
    const quantidade = randomInt(20, 300)

    // OPs em estados ativos têm máquina alocada
    const precisaMaquina = ![
      'aguardando_materia_prima',
      'cancelado',
    ].includes(status)
    const maquina = precisaMaquina ? randomChoice(maquinas) : null

    const dataPrevistaInicio = daysFromNow(randomInt(-30, 5))
    const dataPrevistaFim = new Date(
      dataPrevistaInicio.getTime() + randomInt(1, 7) * 24 * 60 * 60 * 1000,
    )

    let dataRealInicio: Date | null = null
    let dataRealFim: Date | null = null
    if (
      ['em_producao', 'acabamento', 'embalagem', 'pronto_envio', 'enviado'].includes(
        status,
      )
    ) {
      dataRealInicio = new Date(
        dataPrevistaInicio.getTime() + randomInt(-1, 2) * 24 * 60 * 60 * 1000,
      )
    }
    if (['pronto_envio', 'enviado'].includes(status)) {
      dataRealFim = new Date(
        (dataRealInicio?.getTime() ?? dataPrevistaFim.getTime()) +
          randomInt(1, 5) * 24 * 60 * 60 * 1000,
      )
    }

    rows.push({
      // numero é sobrescrito pelo trigger BEFORE INSERT
      numero: '',
      produtoId: produto.id,
      variacaoId: variacao?.id ?? null,
      quantidade,
      maquinaId: maquina?.id ?? null,
      canalDestino: randomChoice(CANAIS),
      prioridade: randomChoice(PRIORIDADES),
      status,
      dataPrevistaInicio,
      dataPrevistaFim,
      dataRealInicio,
      dataRealFim,
      criadoPor: gerenteId,
      responsavelId: i % 2 === 0 ? gerenteId : adminId,
      observacoes: i % 4 === 0 ? 'OP de demonstração — gerada por seed.' : null,
    })
  }

  const inserted = await db.insert(schema.ordensProducao).values(rows).returning()
  return inserted
}

// -----------------------------------------------------------------
// Apontamentos (pra OPs em produção)
// -----------------------------------------------------------------

async function seedApontamentos(
  ordens: schema.OrdemProducao[],
  operadorId: string,
) {
  console.log('▶ Criando apontamentos pras OPs em produção…')
  const ativas = ordens.filter(
    (o) =>
      o.maquinaId &&
      ['em_producao', 'acabamento', 'embalagem', 'pronto_envio', 'enviado'].includes(
        o.status,
      ),
  )

  const rows: schema.NewApontamentoProducao[] = []
  for (const op of ativas) {
    const numApontamentos = randomInt(1, 3)
    const inicioBase = op.dataRealInicio ?? new Date()
    for (let i = 0; i < numApontamentos; i++) {
      const inicio = new Date(inicioBase.getTime() + i * 8 * 60 * 60 * 1000)
      const fim = new Date(inicio.getTime() + randomInt(4, 8) * 60 * 60 * 1000)
      const quantidadeProduzida = Math.floor(op.quantidade / numApontamentos)
      const quantidadeRefugo = Math.max(0, Math.floor(quantidadeProduzida * 0.02))
      rows.push({
        ordemId: op.id,
        maquinaId: op.maquinaId!,
        operadorId,
        inicio,
        fim,
        quantidadeProduzida,
        quantidadeRefugo,
      })
    }
  }

  if (rows.length > 0) {
    await db.insert(schema.apontamentosProducao).values(rows)
  }
  console.log(`  • ${rows.length} apontamentos`)
}

// -----------------------------------------------------------------
// Movimentações de estoque (entrada de produção + saída por canal)
// -----------------------------------------------------------------

async function seedMovimentacoes(
  ordens: schema.OrdemProducao[],
  estoquistaId: string,
) {
  console.log('▶ Criando movimentações de estoque…')
  const rows: schema.NewMovimentacaoEstoque[] = []

  for (const op of ordens) {
    // Entrada: para tudo que já saiu de em_producao
    if (
      ['acabamento', 'embalagem', 'pronto_envio', 'enviado'].includes(op.status)
    ) {
      rows.push({
        produtoId: op.produtoId,
        variacaoId: op.variacaoId ?? null,
        tipo: 'entrada_producao',
        quantidade: op.quantidade,
        referenciaId: op.id,
        referenciaTipo: 'ordem_producao',
        usuarioId: estoquistaId,
        observacao: `Entrada da OP ${op.numero}`,
      })
    }

    // Saída: pra OPs já enviadas
    if (op.status === 'enviado') {
      const tipo: schema.MovimentacaoEstoque['tipo'] =
        op.canalDestino === 'full_ml'
          ? 'saida_full_ml'
          : op.canalDestino === 'full_shopee'
            ? 'saida_full_shopee'
            : 'saida_venda_direta'

      rows.push({
        produtoId: op.produtoId,
        variacaoId: op.variacaoId ?? null,
        tipo,
        quantidade: op.quantidade,
        referenciaId: op.id,
        referenciaTipo: 'ordem_producao',
        usuarioId: estoquistaId,
        observacao: `Saída da OP ${op.numero} → ${op.canalDestino}`,
      })
    }
  }

  if (rows.length > 0) {
    await db.insert(schema.movimentacoesEstoque).values(rows)
  }
  console.log(`  • ${rows.length} movimentações`)
}

// -----------------------------------------------------------------
// Run
// -----------------------------------------------------------------

async function main() {
  console.log('🌱 Iniciando seed do banco…\n')

  await reset()
  const idsByRole = await seedUsuarios()

  const operadorId = idsByRole.get('operador')!
  const estoquistaId = idsByRole.get('estoquista')!

  const maquinas = await seedMaquinas(operadorId)
  await seedCores()
  await seedModelos()
  await seedTamanhos()
  const { produtos, variacoes } = await seedProdutos()
  const ordens = await seedOrdens(produtos, variacoes, maquinas, idsByRole)
  await seedApontamentos(ordens, operadorId)
  await seedMovimentacoes(ordens, estoquistaId)

  console.log('\n✅ Seed concluído.')
  console.log('\nLogins disponíveis (senha: Senha123!):')
  for (const u of SEED_USERS) {
    console.log(`  • ${u.role.padEnd(18)} ${u.username}`)
  }
}

main()
  .catch((err) => {
    console.error('\n❌ Seed falhou:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await client.end()
  })

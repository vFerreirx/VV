import 'server-only'

// O PIN DE TROCA RÁPIDA — hash e conferência.
//
// `server-only` de propósito: este arquivo lida com o segredo, e um import
// acidental num Client Component mandaria a função de conferência (e o
// caminho que leva ao hash) pro navegador. O erro aparece no build.
//
// ⚠️ SCRYPT DO `node:crypto`, sem dependência nova. bcrypt/argon2 seriam
// melhores num contexto de senha exposta à internet; aqui a decisão é outra:
// trazer um pacote nativo compilado pra dentro do deploy da Vercel por causa
// de quatro dígitos que já são deliberadamente fracos não paga o custo. O
// scrypt é lento o bastante pra tornar a força bruta desagradável, e quem
// realmente segura a porta é o BLOQUEIO POR TENTATIVAS — com dez teclas e
// quatro casas, nenhum hash do mundo compensa deixar tentar à vontade.
//
// Formato guardado: `scrypt$<salt-hex>$<hash-hex>`. O prefixo existe pra que
// trocar de algoritmo um dia não exija adivinhar o que está no banco.

import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

const ALGO = 'scrypt'
const TAMANHO_HASH = 64

// Quantas erradas até travar, e por quanto tempo.
//
// ⚠️ 30 SEGUNDOS, E ISSO É UMA ESCOLHA DE CHÃO DE FÁBRICA, não um descuido.
// Um bloqueio de minutos para a estação por causa de dedo errado — e o
// prejuízo de uma máquina parada é certo, enquanto o do PIN adivinhado é
// hipotético. A conta que se aceita: 5 tentativas a cada 30s são ~600 por
// hora, então varrer as 10.000 combinações levaria uma jornada inteira
// tocando o teclado na frente da fábrica toda.
//
// O que sustenta esse número é o que o PIN protege: ATRIBUIÇÃO, não
// privilégio. Quem adivinha o PIN do colega da mesma estação chega onde já
// podia chegar — `operadorPodeAgirNaOrdem` deixa qualquer operador agir em
// qualquer OP da estação dele, de propósito, por causa da virada de turno.
// O que ele ganha é escrever o nome errado num registro, que o
// `eventos_kanban` continua desmentindo.
export const TENTATIVAS_ATE_BLOQUEIO = 5
export const SEGUNDOS_DE_BLOQUEIO = 30

// PINs que não protegem ninguém. Não é uma lista de senhas fracas — é o
// mínimo pra que a troca rápida não vire "todo mundo usa 1234", que
// devolveria exatamente o problema de autoria que o PIN existe pra resolver.
const PROIBIDOS = new Set([
  '0000', '1111', '2222', '3333', '4444',
  '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '0123', '3210', '1212', '2121',
])

/** Por que este PIN não serve, ou null se serve. */
export function erroDePin(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'O PIN precisa ter 4 números'
  if (PROIBIDOS.has(pin)) {
    return 'Esse PIN é fácil demais de adivinhar. Escolha outro.'
  }
  return null
}

export function gerarHashDePin(pin: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pin, salt, TAMANHO_HASH)
  return `${ALGO}$${salt.toString('hex')}$${hash.toString('hex')}`
}

/**
 * Confere o PIN contra o hash guardado.
 *
 * ⚠️ `timingSafeEqual`, e não `===`: comparação normal de string sai no
 * primeiro byte diferente, e a diferença de tempo entre "errou no primeiro
 * dígito" e "errou no último" é medível. Com quatro dígitos, esse vazamento
 * transforma 10.000 tentativas em 40.
 */
export function conferirPin(pin: string, guardado: string | null): boolean {
  if (!guardado) return false
  const [algo, saltHex, hashHex] = guardado.split('$')
  if (algo !== ALGO || !saltHex || !hashHex) return false

  const esperado = Buffer.from(hashHex, 'hex')
  if (esperado.length !== TAMANHO_HASH) return false

  const calculado = scryptSync(pin, Buffer.from(saltHex, 'hex'), TAMANHO_HASH)
  return timingSafeEqual(calculado, esperado)
}

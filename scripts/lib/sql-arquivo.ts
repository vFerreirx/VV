/**
 * Ler um .sql de backup: dividir em comandos e ler o manifesto. Puro, sem
 * banco — é o que `scripts/restore-db.ts` usa, e o que dá pra testar sem
 * restaurar nada.
 *
 * Por que dividir, em vez de mandar o arquivo inteiro num `unsafe()`: quando
 * a restauração falha, a pergunta é QUAL comando e EM QUE LINHA. O Postgres
 * só devolve a posição dentro da string pra erro de sintaxe; um "type does
 * not exist" no comando 400 de 900 viria sem endereço nenhum.
 */

export type Comando = {
  /** Linha (1-based) onde o comando começa no arquivo. */
  linha: number
  /** Última seção `-- ========== X ==========` vista antes dele. */
  secao: string
  texto: string
}

/**
 * Divide o SQL nos `;` de nível zero. O `;` só termina o comando fora de:
 *   - comentário `-- …` e `/* … *\/` (aninhado, como no Postgres);
 *   - string `'…'` (com `''` de escape) e `E'…'` (com `\` de escape — é o
 *     que `quote_nullable` gera quando o texto tem barra invertida);
 *   - identificador `"…"`;
 *   - dollar-quote `$tag$…$tag$` — o corpo das funções, cheio de `;` e de
 *     linhas começando com BEGIN que NÃO são o BEGIN da transação.
 * `$1` não é dollar-quote: tag não começa com dígito.
 */
export function dividirSql(sql: string): Comando[] {
  const comandos: Comando[] = []
  let secao = ''
  let inicio = -1 // índice do primeiro caractere útil do comando atual
  let linhaInicio = 0
  let linha = 1
  let i = 0
  const n = sql.length
  const identChar = (c: string | undefined) => !!c && /[A-Za-z0-9_$]/.test(c)
  const marcaInicio = () => {
    if (inicio < 0) {
      inicio = i
      linhaInicio = linha
    }
  }
  // Avança até `fim` (exclusivo) contando as quebras de linha no caminho.
  const pular = (fim: number) => {
    for (; i < fim; i++) if (sql[i] === '\n') linha++
  }

  while (i < n) {
    const c = sql[i]

    if (c === '\n') {
      linha++
      i++
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }

    // Comentário de linha. Fora de comando, pode ser o marcador de seção.
    if (c === '-' && sql[i + 1] === '-') {
      const fim = sql.indexOf('\n', i)
      const fimReal = fim < 0 ? n : fim
      if (inicio < 0) {
        const m = /^-- ========== (.+?) ==========/.exec(sql.slice(i, fimReal))
        if (m) secao = m[1]
      }
      i = fimReal
      continue
    }

    // Comentário de bloco (o Postgres aninha).
    if (c === '/' && sql[i + 1] === '*') {
      let prof = 0
      while (i < n) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          prof++
          i += 2
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          prof--
          i += 2
          if (prof === 0) break
        } else {
          if (sql[i] === '\n') linha++
          i++
        }
      }
      continue
    }

    marcaInicio()

    if (c === ';') {
      comandos.push({ linha: linhaInicio, secao, texto: sql.slice(inicio, i).trim() })
      inicio = -1
      i++
      continue
    }

    // String. E'…' só se o E não for o fim de um identificador (ex.: `DATE'…'`
    // não existe, mas `nome'` também não — a regra é a do lexer).
    if (c === "'") {
      const escape = (sql[i - 1] === 'E' || sql[i - 1] === 'e') && !identChar(sql[i - 2])
      i++
      while (i < n) {
        const d = sql[i]
        if (escape && d === '\\') {
          pular(i + 2)
          continue
        }
        if (d === "'") {
          if (sql[i + 1] === "'") {
            i += 2
            continue
          }
          i++
          break
        }
        if (d === '\n') linha++
        i++
      }
      continue
    }

    if (c === '"') {
      i++
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2
            continue
          }
          i++
          break
        }
        if (sql[i] === '\n') linha++
        i++
      }
      continue
    }

    if (c === '$' && !identChar(sql[i - 1])) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64))
      if (m) {
        const tag = m[0]
        const fim = sql.indexOf(tag, i + tag.length)
        if (fim < 0) throw new Error(`dollar-quote ${tag} aberto na linha ${linha} e nunca fechado`)
        pular(fim + tag.length)
        continue
      }
    }

    i++
  }

  if (inicio >= 0) {
    const resto = sql.slice(inicio).trim()
    if (resto) comandos.push({ linha: linhaInicio, secao, texto: resto })
  }
  return comandos
}

export type Manifesto = {
  tabelas: { tabela: string; linhas: number }[]
  total: number
  triggers: number
  politicas: number
  /** "2026=165" (vários anos separados por vírgula), ou "-" se vazio. */
  opNumeroCounter: string
}

/**
 * Lê as linhas `-- manifesto:…` que `scripts/backup-db.ts` escreve depois do
 * COMMIT. Backup sem manifesto (os de antes de 23/09/2026) devolve null — o
 * restore roda, só não tem com o que comparar.
 */
export function lerManifesto(sql: string): Manifesto | null {
  const tabelas: Manifesto['tabelas'] = []
  let total: number | null = null
  let triggers: number | null = null
  let politicas: number | null = null
  let opNumeroCounter: string | null = null
  for (const l of sql.split('\n')) {
    let m: RegExpExecArray | null
    if ((m = /^-- manifesto:tabela (\S+) (\d+)\s*$/.exec(l))) {
      tabelas.push({ tabela: m[1], linhas: Number(m[2]) })
    } else if ((m = /^-- manifesto:total (\d+)\s*$/.exec(l))) total = Number(m[1])
    else if ((m = /^-- manifesto:triggers (\d+)\s*$/.exec(l))) triggers = Number(m[1])
    else if ((m = /^-- manifesto:politicas (\d+)\s*$/.exec(l))) politicas = Number(m[1])
    else if ((m = /^-- manifesto:op_numero_counter (\S+)\s*$/.exec(l))) opNumeroCounter = m[1]
  }
  if (total === null || tabelas.length === 0) return null
  return {
    tabelas,
    total,
    triggers: triggers ?? -1,
    politicas: politicas ?? -1,
    opNumeroCounter: opNumeroCounter ?? '-',
  }
}

/**
 * QUEM É o banco de uma URL — o que a trava do restore compara.
 *
 * ⚠️ NÃO É O HOST. O pooler do Supabase (`aws-1-sa-east-1.pooler.supabase.com`)
 * é o MESMO host pra todo projeto da região; quem diz o projeto é o usuário,
 * `postgres.<ref>`. E a conexão direta da MESMA produção tem outro host,
 * `db.<ref>.supabase.co`. Comparando só host, a trava recusaria o projeto de
 * teste pelo pooler e DEIXARIA restaurar em cima da produção pela conexão
 * direta. O `ref` resolve os dois; o host só vale quando não há ref (Postgres
 * fora do Supabase). A senha não entra em nada disto.
 */
export type IdentidadeDoBanco = { host: string; ref: string | null; usuario: string; porta: string }

export function identidadeDoBanco(url: string): IdentidadeDoBanco {
  const u = new URL(url)
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') {
    throw new Error(`não é uma URL de Postgres (${u.protocol})`)
  }
  const host = u.hostname.toLowerCase()
  if (!host) throw new Error('URL sem host')
  const usuario = decodeURIComponent(u.username)
  const doUsuario = /^[^.]+\.([a-z0-9]+)$/i.exec(usuario)?.[1]
  const doHost = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host)?.[1]
  const ref = (doUsuario ?? doHost ?? null)?.toLowerCase() ?? null
  // O usuário vai como veio (a URL guarda a senha em outro campo).
  return { host, ref, usuario, porta: u.port || '5432' }
}

/** É o mesmo banco? Mesmo ref → sim. Sem ref dos dois lados → compara host. */
export function mesmoBanco(a: IdentidadeDoBanco, b: IdentidadeDoBanco): boolean {
  if (a.ref && b.ref) return a.ref === b.ref
  return a.host === b.host
}

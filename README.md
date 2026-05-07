# Malharia MVP

Sistema interno de gestão de produção e Full ML/Shopee para uma malharia com 18 teares circulares.
Esta é a primeira fase (MVP, sem integrações externas): auth, produtos, máquinas, ordens de produção, kanban e usuários.

## Stack

- **Next.js 16** (App Router) com TypeScript strict — Turbopack ligado por padrão
- **React 19.2**
- **Supabase** — Postgres + Auth + Realtime (Storage não é usado nesta fase)
- **Drizzle ORM** com `drizzle-kit` para migrations
- **TailwindCSS v4** + **shadcn/ui** (preset `base-nova`, base-color `slate`)
- **dnd-kit** no kanban
- **Zod** + **React Hook Form** nos formulários
- **TanStack Query** para data fetching client-side
- Server Actions para mutations
- **sonner** para toasts, **lucide-react** para ícones, **date-fns** com locale pt-BR

## Pré-requisitos

- **Node.js ≥ 20.9** (instalado: v24.15)
- **npm ≥ 10**
- **Docker Desktop** rodando (necessário pelo Supabase CLI local)
- **Supabase CLI** — `npm i -g supabase` ou via Scoop/Chocolatey

> Em PowerShell, se a execução de `npm.ps1` estiver bloqueada, use `npm.cmd` ou rode `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Setup local (passo a passo)

### 1. Instalar dependências

```bash
npm install
```

### 2. Iniciar Supabase local

Em todo dia de trabalho (Docker Desktop precisa estar rodando):

```bash
npm run supabase:start   # sobe Postgres + Auth + Realtime + Studio em containers
npm run supabase:status  # exibe URLs e chaves locais
```

> O `supabase init` já foi executado neste repositório — `supabase/config.toml` está versionado.

### 3. Variáveis de ambiente

Copie o exemplo e preencha com as chaves que `supabase status` mostrou:

```bash
cp .env.example .env.local
```

Os valores que você precisa colar do `supabase status`:

- `API URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`
- A `DB URL` já está no `.env.example` apontando pra porta padrão `54322`.

### 4. Setup do banco (schema + RLS + triggers)

```bash
npm run db:setup    # roda drizzle-kit migrate e aplica supabase/sql/*.sql em ordem
```

Esse comando aplica:

1. As migrations do Drizzle (`drizzle/0000_initial_schema.sql` etc) — cria todas as tabelas e enums
2. `supabase/sql/01_constraints.sql` — FK de `public.users` pra `auth.users` + FKs circulares users↔maquinas
3. `supabase/sql/02_op_numero.sql` — sequência por ano e trigger que gera `OP-AAAA-NNNN`
4. `supabase/sql/03_handle_new_user.sql` — trigger que cria `public.users` quando alguém é criado em `auth.users`
5. `supabase/sql/04_rls.sql` — `auth.user_role()`, `auth.is_manager()` e policies por role em todas as tabelas

Pra zerar o banco e refazer tudo do zero:

```bash
npm run db:reset    # supabase db reset + db:setup
```

### 5. Seeds (a partir da Fase 4)

```bash
npm run db:seed     # popula 18 máquinas, 10 produtos, 5 usuários, 20 OPs
```

### 5. Rodar o app

```bash
npm run dev
```

App em <http://localhost:3000>.
Supabase Studio em <http://127.0.0.1:54323>.

## Comandos úteis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o Next em modo dev (Turbopack) |
| `npm run build` | Build de produção |
| `npm run lint` | Roda ESLint |
| `npm run type-check` | `tsc --noEmit` em todo o projeto |
| `npm run format` | Roda Prettier no repo |
| `npm run db:generate` | Gera migration SQL a partir do schema Drizzle |
| `npm run db:migrate` | Aplica só as migrations Drizzle |
| `npm run db:setup` | Drizzle migrate + aplica `supabase/sql/*.sql` |
| `npm run db:reset` | `supabase db reset` + `db:setup` (banco zerado) |
| `npm run db:studio` | Abre Drizzle Studio no browser |
| `npm run db:seed` | Popula seeds (Fase 4 em diante) |
| `npm run test:e2e` | Roda os testes Playwright |

## Estrutura

```
src/
  app/
    (auth)/login, (auth)/signup
    (app)/
      dashboard, produtos, maquinas, producao,
      ordens, usuarios, configuracoes
  components/
    ui/         # shadcn
    kanban/     # board, colunas, cards
    forms/      # formulários compartilhados
    layout/     # sidebar, topbar, shells
  lib/
    supabase/   # client (browser), server, proxy
    db/         # schema Drizzle, queries
    auth/       # helpers de auth e role
    validators/ # schemas Zod
    utils/      # cn(), formatadores de data, etc
  hooks/
  types/
supabase/
  config.toml   # config do Supabase CLI
  sql/          # FKs externas, triggers, RLS — aplicados por scripts/setup-db.ts
drizzle/        # migrations geradas pelo drizzle-kit (schema do app)
scripts/
  setup-db.ts   # orquestrador: drizzle migrate + apply supabase/sql/
  seed.ts       # seeds (Fase 4)
tests/e2e/      # Playwright
```

## Decisões e convenções

- **Datas em UTC no banco**, formatadas no client com timezone `America/Sao_Paulo` via date-fns.
- **Mensagens de UI em PT-BR.** Comentários de código em PT-BR também.
- **Server Components por padrão**; `'use client'` só quando precisar de interatividade.
- **Server Actions** sempre com validação Zod no início; retorno `{ success, data?, error? }`.
- **Soft delete** via coluna `deleted_at` onde aplicável.
- **Numeração de OP** (`OP-AAAA-NNNN`) é gerada por sequence + trigger no Postgres, reiniciando por ano.
- **Sem fotos de produto** nesta fase (decisão da Fase 0).

## Notas sobre Next 16

O `create-next-app` instalou Next 16.2.5 (acima do mínimo "14+" do spec). Pontos a lembrar:

- `cookies()`, `headers()`, `params`, `searchParams` são **assíncronos** — sempre `await`.
- O arquivo de middleware se chama **`proxy.ts`** (não `middleware.ts`) e roda em runtime `nodejs`.
- Turbopack é o default em `dev` e `build`.
- ESLint Flat Config (`eslint.config.mjs`); `next lint` foi removido — usar `npm run lint`.

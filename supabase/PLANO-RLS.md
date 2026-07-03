# Plano: fechar os buracos de RLS

> Status: **APLICADA em 03/07/2026** (migration
> `sql/24_rls_fechar_buracos.sql`). Verificação pós-aplicação:
> 0 políticas abertas; simulação com usuários reais (role authenticated
> via SET LOCAL) confirmou: operador não escreve em permissoes_acesso
> (42501), não lê vendas (0 linhas), não altera estações; cargo vendas lê
> vendas normalmente; operador segue lendo ordens (kanban/realtime ok).

## Diagnóstico (03/07/2026)

Todo acesso do app ao banco é **server-side** (Drizzle via `DATABASE_URL`,
role `postgres`, que ignora RLS). O browser só usa o Supabase pra **Auth**
e **Realtime** (assina `ordens_producao` no kanban e no sino). Nenhum
componente client consulta tabelas via PostgREST.

Logo, as políticas RLS existem só pra conter quem falar **direto** com a
API REST do Supabase (qualquer usuário logado tem a anon key + JWT).

As tabelas da fase inicial (04_rls.sql) já são fechadas por cargo, usando
os helpers `is_manager()` e `user_role()` (SECURITY DEFINER, leem
`public.users` pelo `auth.uid()`):

| Tabela | Escrita via REST hoje |
|---|---|
| produtos, variações, cores, modelos, tamanhos, máquinas, ordens, users | só admin/gerente (ok) |
| apontamentos | gerente ou operador dono (ok) |
| movimentações estoque | admin/gerente/estoquista (ok) |

O problema são as tabelas criadas DEPOIS, com política `FOR ALL ...
USING (true)` — **qualquer usuário logado lê e escreve**:

| Tabela | Risco |
|---|---|
| `permissoes_acesso` | **CRÍTICO**: usuário pode se auto-conceder acesso total |
| `vendas`, `vendas_marketplace` | alterar/ler faturamento sem ter a área |
| `estacoes` | reatribuir máquinas/operadores |
| `eventos_full` | mexer no calendário |
| `kits`, `kit_itens` | alterar composição de kits |

## Correção (migration 24)

Padrão das tabelas antigas: SELECT liberado pra `authenticated` + escrita
gated por cargo. Regras escolhidas (espelham os padrões fixos do app):

| Tabela | SELECT | Escrita (INSERT/UPDATE/DELETE) |
|---|---|---|
| `permissoes_acesso` | authenticated | **só admin** |
| `vendas`, `vendas_marketplace` | admin/gerente/vendas | admin/gerente/vendas |
| `estacoes` | authenticated (kanban usa cor/nome) | admin/gerente |
| `eventos_full` | authenticated | admin/gerente/vendas |
| `kits`, `kit_itens` | authenticated | admin/gerente |

Notas:
- Os níveis **editáveis** de `/permissoes` continuam valendo nas server
  actions (`requireAreaEscrita`) — o RLS é a barreira grossa, pelos
  padrões fixos. Como o app escreve pela role `postgres`, uma concessão
  extra feita pelo admin no app continua funcionando normalmente.
- **Realtime não quebra**: só `ordens_producao` está na publication, e o
  SELECT dela pra authenticated fica como está.
- O app **não muda nada** — nenhuma linha de código depende dessas
  políticas (tudo server-side).

## Roteiro de aplicação (fazer com o sistema em uso baixo)

1. **Backup**: conferir no painel Supabase que o backup diário está ok
   (Settings → Database → Backups).
2. Aplicar `sql/24_rls_fechar_buracos.sql` (idempotente).
3. **Smoke test** (5 min, como admin): registrar/editar venda do dia;
   importar CSV; mover OP no kanban em duas janelas (realtime); criar/
   editar kit; editar estação; criar evento no calendário; abrir
   /permissoes e alterar um nível.
4. **Teste como operador**: login de operador → kanban funciona, pegar
   OP funciona, sino carrega.
5. Se algo falhar: rollback = recriar a política aberta da tabela
   afetada (comando no fim da migration, comentado).

## Fase 2 (opcional, depois)

- Restringir SELECT de `users` (hoje qualquer logado lê emails/roles).
- Avaliar espelhar os níveis editáveis no RLS (função que lê
  `permissoes_acesso`) — só vale se algum dia o client consultar o banco
  direto; hoje é complexidade sem ganho.

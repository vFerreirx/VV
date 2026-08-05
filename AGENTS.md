<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Dados do usuário — REGRAS CRÍTICAS

O usuário trabalha com dados reais (usuários cadastrados, modelos, cores,
produtos, máquinas, OPs). O sistema está em produção dele, não é mais
playground.

**NUNCA fazer sem confirmação explícita do usuário:**

- ❌ Rodar `npm run db:seed` — esse script faz `TRUNCATE` de todas as
  tabelas de domínio e recria do zero, **apagando tudo que ele cadastrou**.
- ❌ Rodar `TRUNCATE` ou `DELETE FROM <tabela>` em qualquer SQL.
- ❌ Apagar/recriar usuários do auth.users via Admin API.
- ❌ Rodar migrations que façam `DROP COLUMN` em colunas com dados
  importantes sem antes copiar/backupar.

**Sempre OK:**

- ✅ `npm run db:setup` — só altera schema (CREATE/ALTER), idempotente.
- ✅ `INSERT` pontual pra adicionar dado de teste sem mexer no existente.
- ✅ Mudanças de UI/código que não tocam o banco.

Se precisar testar com dados de demonstração, **avise antes** e proponha
inserir só linhas extras, nunca substituir.

## Permissões — REGRAS FIXAS

- **Admin** tem SEMPRE todas as permissões (acesso e ações em tudo).
- **Gerente de produção** tem controle total de tudo que é produção
  (OPs/kanban, estações, máquinas, mover qualquer status, etc.).
  O helper `isManager` (admin + gerente_producao) deve liberar essas ações.
- **Operador** age sobre o que é dele: pode mover/apontar a OP cujo
  `responsavelId` é ele (no fluxo puxado ele "pega" a OP pra virar dono).
- Ao criar qualquer ação/guarda nova, verifique que admin e gerente não
  ficam bloqueados.

### Acesso por área (editável pelo admin)

- O **acesso a cada área/tela** é editável em `/permissoes` (só admin), com
  **3 níveis** por (cargo, área): `nenhum` (desativado), `ver` (só ver) e
  `total` (controle total). Cargos editáveis: gerente_producao, operador,
  estoquista, vendas. Só o **admin** é travado (sempre `total`, nunca
  editável).
- Enforcement: `requireArea('<area>')` bloqueia a página quando `nenhum`;
  as páginas calculam `podeEditar`/`podeMover` via
  `podeEscrever(await nivelDaAreaPara(role, area))` (= nível `total`/`proprio`)
  pra esconder a edição quando `ver`. O **operador** continua limitado à
  OP que é dele mesmo com "controle total" no kanban.
- O nível padrão de cada (cargo, área) vive em `AREAS[].nivelPadrao`
  (`src/lib/auth/permissoes.ts`); as overrides ficam em `permissoes_acesso`.
- Fonte da verdade dos padrões + lógica pura:
  `src/lib/auth/permissoes.ts` (`AREAS`, `nivelEfetivo`). Overrides no banco
  (`permissoes_acesso`), carregadas em `src/lib/auth/permissoes-db.ts`.
- **Guarda de página**: use `requireArea('<areaKey>')` no topo do
  `page.tsx` (em vez de `requireRole` pra leitura). O menu se esconde
  sozinho via `areasBloqueadas(role)` no layout.
- **Guarda de escrita nas actions**: use `requireAreaEscrita('<areaKey>')`
  (redireciona se o nível efetivo do cargo não permite escrever). É o
  padrão de TODA action de escrita em área editável — assim o que a tela
  de permissões mostra é o que as actions entregam. Exceções fixas por
  `requireRole(['admin'])`: `usuarios`, `permissoes` e `tarefas` (áreas
  com `editavel: false`, que ninguém pode afrouxar em /permissoes). O kanban valida o
  nível dentro das próprias actions (regra do "próprio" do operador).
- Ao adicionar uma área/tela nova, registre-a em `AREAS` e ponha um item
  no nav com `area`.

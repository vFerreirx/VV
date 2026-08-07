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

- ✅ `npm run db:setup` — idempotente. Aplica os `supabase/sql/NN_*.sql` em
  ordem. Quase tudo ali é schema (CREATE/ALTER), mas há **carga de dados**
  também (`39_precos_carga.sql`): são `INSERT ... ON CONFLICT DO NOTHING`,
  que só preenchem buraco e nunca sobrescrevem o que o usuário editou. Se
  for escrever carga nova, é esse o padrão — `UPSERT` faria o valor
  cadastrado por ele voltar pro original no próximo setup, em silêncio.
- ✅ `INSERT` pontual pra adicionar dado de teste sem mexer no existente.
- ✅ Mudanças de UI/código que não tocam o banco.

Se precisar testar com dados de demonstração, **avise antes** e proponha
inserir só linhas extras, nunca substituir.

## Catálogo: peso e preço vivem no par (produto, tamanho)

Não existe peso nem preço "do produto". A Peseira ACONCHEGO pesa 950 g no
Casal e 1200 g no King, e custa 50 no Casal e 70 no King; no 45x45 a capa
ACONCHEGO custa 25 e a LINKS custa 20. **Só o par resolve.**

- `produto_tamanho_preco` (`supabase/sql/38_precos.sql`) — preço de tabela.
- `produto_tamanho_peso` (`supabase/sql/40_peso_produto_tamanho.sql`) —
  peso. Espelha a de preço de propósito: mesmo eixo, mesma forma.
- `kit_tamanho_preco` (38) — preço FECHADO do kit. Opcional; ver kits abaixo.
- `tamanhos.peso_gramas` continua sendo o **padrão** por tamanho. O par
  vence quando existe; sem ele, vale o do tamanho.
- ⚠️ `produtos.peso_gramas` é **legado**. Não leia nem escreva — está no
  banco só como histórico do que a migration 40 copiou, igual a
  `largura_cm`/`comprimento_cm`. Mesma coisa: não existe campo único de
  preço em `produtos` nem em `kits`.

### Peso é recalculado, preço é snapshot — e isso é de propósito

São opostos, e confundir os dois quebra o sistema de um jeito silencioso:

- **Peso**: SEMPRE recalculado na leitura, do catálogo de agora. Corrigir o
  peso de um tamanho tem que passar a valer em todo pedido, inclusive nos
  antigos — peso serve pra cotar frete.
- **Preço**: `orcamento_itens.preco_unitario` é SNAPSHOT do negociado.
  Mexer no preço de tabela **não pode** alterar pedido já salvo. O preço de
  tabela é só SUGESTÃO, que preenche o campo e para por aí — o campo é
  sempre editável.

Os comentários de topo de `src/lib/peso.ts` e `src/lib/preco.ts` explicam
isso e se referenciam. Ao mexer num, mantenha o outro coerente.

### Onde está o quê

- Lógica pura (sem banco): `src/lib/peso.ts`, `src/lib/preco.ts`,
  `src/lib/kit-tamanhos.ts`.
- Consultas: `src/lib/db/pesos.ts` e `src/lib/db/precos.ts` — uma consulta
  pra lista inteira, nada de N+1.
- Catálogos do pedido: `obterCatalogoDePesos` / `obterCatalogoDePrecos` em
  `src/app/(app)/pedidos/actions.ts`, chaveados por `${donoId}|${tamanho}`.
- Cadastro: a tela do produto tem UMA lista por tamanho com preço e peso na
  mesma linha (`src/components/forms/produto-form.tsx`). Campo vazio apaga a
  linha e quer dizer "sem preço" / "usa o peso do tamanho" — nunca zero.

### Kit: o tamanho é POR COMPONENTE

`src/lib/kit-tamanhos.ts` é a fonte única da regra, compartilhada por três
lugares — o builder do pedido, o cadastro de preço do kit e o cálculo de
preço. **Se divergirem, um preço cadastrado vira inalcançável pelo pedido
sem ninguém perceber.** Está escrito no topo do arquivo; leia antes de mexer.

- Componente com 2+ tamanhos ganha o próprio seletor; com um só, resolve
  sozinho (capa 45x45, manta Manta).
- `orcamento_itens.tamanho` só guarda algo quando há EXATAMENTE um
  componente variável. Com zero ou 2+ vai null — a fonte real de cada peça é
  o snapshot `kit_componentes[].tamanho`, sempre preenchido.
- `kit_tamanho_preco` idem: só faz sentido com um tamanho único. Kit sem
  preço fechado cai na SOMA dos componentes, cada um no tamanho dele.

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

import {
  AREAS,
  nivelEfetivo,
  type OverridesAcesso,
  type Role,
} from '@/lib/auth/permissoes'

// A CASA DE CADA CARGO — onde ele cai ao entrar, sem destino pedido.
//
// Existe pra que os pontos de entrada não divirjam: o login
// (src/app/(auth)/login/actions.ts), a raiz do site (src/app/page.tsx) e o
// /dashboard, que devolve pra casa quem não é da gestão.
//
//   operador   → /producao  (o tablet da estação)
//   vendas     → /remessas  (quem cuida do marketplace — as remessas Full)
//   estoquista → /estoque
//   admin, gerente_producao → /dashboard
//
// O dashboard é painel de GESTÃO e só abre pra admin e gerente — a área
// `dashboard` é travada nesses dois (src/lib/auth/permissoes.ts), e a página
// confere o nível e manda os outros cargos pra `casaAcessivel`.
export function rotaInicial(role: Role | undefined): string {
  switch (role) {
    case 'operador':
      return '/producao'
    // ⚠️ O CARGO "VENDAS" NÃO É A ÁREA "VENDAS". O cargo é de quem cuida do
    // marketplace; a área Vendas (/vendas) é o faturamento, pra admin e CEO.
    // A casa dele é a das remessas Full.
    case 'vendas':
      return '/remessas'
    case 'estoquista':
      return '/estoque'
    default:
      return '/dashboard'
  }
}

// Última saída: só exige estar logado.
const SEM_AREA = '/configuracoes'

/**
 * A casa do cargo, SE ele tiver acesso a ela; senão, a primeira área que ele
 * acessa, na ordem de `AREAS`; em último caso, /configuracoes.
 *
 * ⚠️ É ISTO QUE IMPEDE O LOOP DE REDIRECT. `requireArea` manda quem não tem
 * acesso pra /dashboard, e o /dashboard manda quem não é da gestão pra casa.
 * Se a casa fosse redirecionada às cegas e o cargo não tivesse acesso a ela
 * — um admin que desligue Remessas pro cargo vendas em /permissoes, por
 * exemplo —, os dois se mandariam um pro outro pra sempre. Aqui a casa só é
 * escolhida quando é acessível.
 */
export function casaAcessivel(
  role: Role | undefined,
  overrides: OverridesAcesso,
): string {
  if (!role) return rotaInicial(role)
  const acessa = (href: string) => {
    const area = AREAS.find((a) => a.href === href)
    return area !== undefined && nivelEfetivo(role, area.key, overrides) !== 'nenhum'
  }
  const preferida = rotaInicial(role)
  if (acessa(preferida)) return preferida
  const primeira = AREAS.find(
    (a) => nivelEfetivo(role, a.key, overrides) !== 'nenhum',
  )
  return primeira?.href ?? SEM_AREA
}

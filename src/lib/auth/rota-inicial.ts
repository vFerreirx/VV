import type { Role } from '@/lib/auth/permissoes'

// A CASA DE CADA CARGO — onde ele cai ao entrar, sem destino pedido.
//
// Existe pra que os dois pontos de entrada não divirjam: o login
// (src/app/(auth)/login/actions.ts) e a raiz do site (src/app/page.tsx)
// mandavam todo mundo pro dashboard, cada um com o caminho escrito à mão.
// Dois literais iguais é uma cópia esperando pra ficar velha.
//
// O OPERADOR VAI PRO CHÃO DE FÁBRICA. O dashboard é painel de gestão —
// faturamento, gráficos, produção agregada; ele abre o sistema pra apontar
// produção, não pra ler indicador. `/producao` detecta o cargo e entrega o
// painel simples dele.
//
// Isto é ROTEAMENTO, não permissão: quem pode ver o quê continua sendo
// `requireArea` + as overrides de /permissoes. Um operador que digite
// /dashboard na barra é tratado pela guarda de lá, como sempre foi.
export function rotaInicial(role: Role | undefined): string {
  return role === 'operador' ? '/producao' : '/dashboard'
}

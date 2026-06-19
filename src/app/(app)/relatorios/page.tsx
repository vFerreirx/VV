import { redirect } from 'next/navigation'

// O relatório mensal foi unificado na aba Vendas (aba "Mensal").
export default function RelatoriosPage() {
  redirect('/vendas?tab=mensal')
}

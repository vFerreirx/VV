import { redirect } from 'next/navigation'

// Estações agora vive na aba unificada /fabrica (Máquinas · Estações).
export default function EstacoesPage() {
  redirect('/fabrica?tab=estacoes')
}

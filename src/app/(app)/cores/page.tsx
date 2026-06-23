import { redirect } from 'next/navigation'

// Cores agora vive na aba unificada /variacoes (Cores · Modelos · Tamanhos).
export default function CoresPage() {
  redirect('/variacoes?tab=cores')
}

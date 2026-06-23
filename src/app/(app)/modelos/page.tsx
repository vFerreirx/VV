import { redirect } from 'next/navigation'

// Modelos agora vive na aba unificada /variacoes (Cores · Modelos · Tamanhos).
export default function ModelosPage() {
  redirect('/variacoes?tab=modelos')
}

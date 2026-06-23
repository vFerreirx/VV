import { redirect } from 'next/navigation'

// Tamanhos agora vive na aba unificada /variacoes (Cores · Modelos · Tamanhos).
export default function TamanhosPage() {
  redirect('/variacoes?tab=tamanhos')
}

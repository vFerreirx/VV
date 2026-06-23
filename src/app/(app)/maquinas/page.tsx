import { redirect } from 'next/navigation'

// Lista de máquinas agora vive na aba unificada /fabrica (Máquinas ·
// Estações). As telas de criar/editar seguem em /maquinas/novo e
// /maquinas/[id].
export default function MaquinasPage() {
  redirect('/fabrica?tab=maquinas')
}
